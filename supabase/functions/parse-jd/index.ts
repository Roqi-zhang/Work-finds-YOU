import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, bufferToBlock, decodeBase64, fileToBlock, getUser, logCall } from "../_shared/req.ts";
import { callAIJson, MODEL, type ContentBlock } from "../_shared/ai.ts";
import { DIMS, computeScore } from "../_shared/scoring.ts";
import {
  PROMPT_VERSIONS,
  RUBRIC_VERSION,
  SCHEMA_VERSION,
  jdExtractionSchema,
  jdProfilingSchema,
  type EvaluationRubric,
  type EvidenceItem,
  type IdealCandidateProfile,
  type IdealDimension,
  type RequirementRecord,
  type RequirementSignal,
} from "../_shared/schemas.ts";
import { idealProfileToDims } from "../_shared/adapter.ts";
import { canonicalHash, sha256Hex } from "../_shared/hash.ts";
import { getAnalysis, putAnalysis, recordDocument } from "../_shared/docstore.ts";

/* ---------------- Layer 1 + 2 : document evidence → requirement records ------- */

const EXTRACT_SYSTEM = `你是资深招聘官，负责忠实读取一份岗位 JD，不做任何评价。
规则：
1. evidence_items 必须是 JD 的**原文摘录**（rawQuote 逐字引用，不得改写、不得总结），id 用 e1、e2… 递增，section 填该句所在的小标题。
2. requirement_records 把 JD 中的每一条要求还原为完整上下文，text 保留完整语义，不要拆成零碎关键词，id 用 r1、r2… 递增，evidenceIds 指回 evidence_items。
3. type：responsibility=岗位职责；qualification=任职资格；must_have=明确硬性要求；nice_to_have=加分项；other=其他。
4. 严禁：打分、判定强弱、推断能力、归类到能力维度。
5. title/company/location/salary 从 JD 中提取，缺失一律填「待确认」。
6. 精简输出：evidence_items 不超过 14 条，每条 rawQuote 不超过 60 字；requirement_records 不超过 16 条。不要重复同义内容。`;

/* ---------------- Layer 3 + 4 : rubric → signals → ideal profile -------------- */

const PROFILE_SYSTEM = `你是资深招聘官，基于已经抽取好的 JD 要求条目，产出这个岗位的评价标准与理想候选人画像。
规则：
1. rubric_dimensions 是**为这个具体岗位量身定义**的评价尺子，覆盖固定 8 个维度：${DIMS.map((d) => `${d.key}=${d.label}`).join("、")}。
   - definition：在这个岗位语境下这一维意味着什么；
   - subdimensions：从 JD 内容归纳出的子能力（2–5 个），不要套用通用模板；
   - strong/medium/weak_anchor：可观察的行为锚点，用于后续判断简历；
   - valid_evidence：什么样的证据才算数；invalid_inferences：不能凭什么就下结论。
2. requirement_signals 把要求条目映射到维度，必须分开表达三件事：
   - requiredLevel = 这个岗位对该维度的能力要求有多高；
   - importance = 这条要求对录用决策有多重要；
   - hard = 是否硬性门槛。
   requirementIds 指回要求条目 id；explicitness 区分 JD 明写还是隐含；confidence 为 0–1。
3. ideal_dimensions 固定输出 8 条，聚合同维度的信号，只输出两段文字：
   - evidence：引 JD 原文，说明这一维的要求体现在哪里；
   - analysis：以招聘专家视角解读这项要求 —— 这个岗位为什么需要它、达到什么程度算合格、JD 的措辞透露出的强度信号。严禁写成「候选人应该怎么做」的行动建议。
   JD 完全没提的维度 requiredLevel 填 missing。
4. 严禁输出任何数值分数，分数由后端计算。
5. 精简输出：每个 anchor 不超过 40 字，definition 不超过 50 字，evidence 不超过 60 字、analysis 不超过 80 字。`;

function slugId(co: string, title: string) {
  return `${co}-${title}`.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "") || `jd-${Date.now()}`;
}

type ExtractOut = {
  title: string;
  company: string;
  location: string;
  salary: string;
  evidence_items: EvidenceItem[];
  requirement_records: RequirementRecord[];
};

type ProfileOut = {
  role_summary: string;
  rubric_dimensions: {
    key: string;
    definition: string;
    subdimensions: string[];
    strong_anchor: string;
    medium_anchor: string;
    weak_anchor: string;
    valid_evidence: string[];
    invalid_inferences: string[];
  }[];
  requirement_signals: RequirementSignal[];
  ideal_dimensions: (IdealDimension & { evidence: string })[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const user = await getUser(req);

    const body = await req.json().catch(() => ({}));
    const guestKey: string = typeof body.guestKey === "string" ? body.guestKey.slice(0, 64) : "";
    const text: string | undefined = typeof body.text === "string" ? body.text.slice(0, 60000) : undefined;
    const filePath: string | undefined = typeof body.filePath === "string" ? body.filePath : undefined;
    const fileData: string | undefined = typeof body.fileData === "string" ? body.fileData : undefined;
    const fileName: string = typeof body.fileName === "string" ? body.fileName : "jd.txt";
    const fileHash: string | undefined =
      typeof body.fileHash === "string" && /^[0-9a-f]{64}$/.test(body.fileHash) ? body.fileHash : undefined;
    if (!text && !filePath && !fileData) return json({ error: "请提供 JD 文本或文件" }, 400);
    if (user && filePath && !filePath.startsWith(`${user.id}/`)) return json({ error: "无权访问该文件" }, 403);

    const admin = adminClient();

    /** Replay a stored job profile — used by both cache short-circuits. */
    const cachedJob = async (hash: string) => {
      const q = admin
        .from("job_profiles")
        .select("id, slug, title, company, location, dimensions, requirements, evidence_items")
        .eq("content_hash", hash)
        .eq("status", "succeeded")
        .limit(1);
      const { data: hit } = await (user ? q.eq("user_id", user.id) : q.eq("guest_key", guestKey)).maybeSingle();
      // An empty reading is not a usable cache entry — re-run instead of replaying it.
      if (hit && Array.isArray(hit.evidence_items) && hit.evidence_items.length > 0) {
        return json({
          job: { id: hit.id, slug: hit.slug, title: hit.title, company: hit.company, location: hit.location },
          salary: "待确认",
          dimensions: hit.dimensions,
          requirements: hit.requirements,
          cached: true,
        });
      }
      return null;
    };

    /* ---------- Fastest path : the browser already hashed the bytes ----------
       Hits before any storage download or PDF/DOCX extraction. */
    if (fileHash) {
      const replay = await cachedJob(fileHash);
      if (replay) return replay;
    }

    /* ---------- Guest trial gate : 1 free JD parse per device ---------- */
    const GUEST_LIMIT = 1;
    let guestRow: { id: string; jd_parses: number } | null = null;
    if (!user) {
      if (!guestKey) return json({ error: "请先登录后再使用 AI 分析" }, 401);
      const { data } = await admin
        .from("guest_trials")
        .select("id, jd_parses")
        .eq("guest_key", guestKey)
        .maybeSingle();
      guestRow = data as typeof guestRow;
    }

    let block: ContentBlock;
    if (filePath || fileData) {
      try {
        block = (filePath
          ? await fileToBlock(admin, "resumes", filePath, fileName)
          : await bufferToBlock(decodeBase64(fileData!), fileName)) as ContentBlock;
      } catch (e) {
        const msg = String((e as Error).message);
        if (msg === "UNSUPPORTED_DOC") {
          return json({ error: "暂不支持 .doc，请另存为 .docx 或导出 PDF" }, 400);
        }
        if (msg === "UNREADABLE_PDF") {
          return json({ error: "该 PDF 无法提取文字（可能是扫描件），请改传可复制文字的文件或截图" }, 400);
        }
        return json({ error: "文件读取失败：" + msg }, 400);
      }
    } else {
      block = { type: "text", text: text! };
    }

    /* ---------- Screenshots: transcribe first, then read the text ----------
       Asking the model to both OCR and structure an image in one shot often
       comes back empty; a dedicated transcription pass is far more reliable. */
    if (block.type === "image_url") {
      try {
        const t = await callAIJson<{ text: string }>({
          messages: [
            { role: "system", content: "你是 OCR 工具。逐字转录图片中的所有文字，保留原始顺序与换行，不要总结、不要翻译、不要添加任何解释。" },
            { role: "user", content: [{ type: "text", text: "请转录这张图片里的全部文字。" }, block] },
          ],
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["text"],
            properties: { text: { type: "string" } },
          },
          schemaName: "image_transcription",
        });
        const ocr = (t.data?.text ?? "").trim();
        if (ocr.replace(/\s/g, "").length >= 20) block = { type: "text", text: ocr.slice(0, 60000) };
      } catch (e) {
        console.error("image transcription failed", e);
      }
    }

    // File uploads are keyed by their raw bytes so the browser can pre-compute the same key.
    const contentHash = fileHash ??
      (await sha256Hex(block.type === "text" ? block.text : JSON.stringify(block).slice(0, 200000)));

    /* ---------- Cache short-circuit : same document → zero model calls ---------- */
    {
      const replay = await cachedJob(contentHash);
      if (replay) return replay;
    }

    /* ---------- Trial gate applies only to a genuinely new document ---------- */
    if (!user && guestRow && guestRow.jd_parses >= GUEST_LIMIT) {
      return json({ error: "免费试用已用完 · 登录后再赠送 3 次完整匹配" }, 401);
    }

    let promptTokens = 0;
    let completionTokens = 0;
    let latency = 0;

    const PROMPT_VER = `${PROMPT_VERSIONS.jdExtraction}+${PROMPT_VERSIONS.jdProfiling}`;
    await recordDocument(admin, {
      contentHash,
      kind: "jd",
      ownerId: user?.id ?? null,
      textLen: block.type === "text" ? block.text.length : undefined,
      storagePath: filePath ?? null,
      fileName: fileName ?? null,
    });

    /* ---------- Cross-user analysis cache : a JD is public text ---------- */
    const cacheKey = {
      contentHash,
      kind: "jd" as const,
      stage: "jd_full",
      promptVersion: PROMPT_VER,
      schemaVersion: SCHEMA_VERSION,
    };
    const cachedAnalysis = await getAnalysis<{ extract: ExtractOut; profile: ProfileOut }>(admin, cacheKey);

    let extract: ExtractOut;
    let profileOut: ProfileOut;

    if (cachedAnalysis) {
      extract = cachedAnalysis.extract;
      profileOut = cachedAnalysis.profile;
    } else {
      /* ---------- Call A : Layer 1 + Layer 2 ---------- */
      const a = await callAIJson<ExtractOut>({
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: [{ type: "text", text: "请忠实读取这份岗位 JD。" }, block] },
        ],
        schema: jdExtractionSchema as unknown as Record<string, unknown>,
        schemaName: "jd_extraction",
      });
      promptTokens += a.usage.prompt_tokens;
      completionTokens += a.usage.completion_tokens;
      latency += a.latencyMs;
      extract = a.data;

      /* ---------- Call B : Layer 3 + Layer 4 ---------- */
      const b = await callAIJson<ProfileOut>({
        messages: [
          { role: "system", content: PROFILE_SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `【岗位】${extract.company || "待确认"} · ${extract.title || "待确认"} · ${extract.location || "待确认"}\n\n` +
                  `【要求条目】\n${JSON.stringify(extract.requirement_records ?? [])}\n\n` +
                  `【原文证据】\n${JSON.stringify(extract.evidence_items ?? [])}`,
              },
            ],
          },
        ],
        schema: jdProfilingSchema as unknown as Record<string, unknown>,
        schemaName: "jd_profiling",
      });
      promptTokens += b.usage.prompt_tokens;
      completionTokens += b.usage.completion_tokens;
      latency += b.latencyMs;
      profileOut = b.data;

      // Never cache a reading that found nothing — otherwise the same file keeps
      // returning an all-[MISSING] profile forever.
      if ((extract.evidence_items?.length ?? 0) > 0 || (extract.requirement_records?.length ?? 0) > 0) {
        await putAnalysis(admin, cacheKey, { extract, profile: profileOut }, b.model);
      }
    }

    const evidenceItems = extract.evidence_items ?? [];
    const requirementRecords = extract.requirement_records ?? [];

    if (evidenceItems.length === 0 && requirementRecords.length === 0) {
      return json(
        { error: "未能从这份 JD 中读出内容 · 可能是扫描件或图片不清晰，请改为粘贴 JD 文本后重试" },
        422,
      );
    }


    /* ---------- Evaluation rubric (JD-derived) ---------- */
    const rubric: EvaluationRubric = {
      version: RUBRIC_VERSION,
      source: "jd_derived",
      benchmark_ref: null,
      roleSummary: profileOut.role_summary || "",
      dimensions: Object.fromEntries(
        (profileOut.rubric_dimensions ?? []).map((d) => [
          d.key,
          {
            definition: d.definition,
            subdimensions: d.subdimensions ?? [],
            anchors: { strong: d.strong_anchor, medium: d.medium_anchor, weak: d.weak_anchor },
            validEvidence: d.valid_evidence ?? [],
            invalidInferences: d.invalid_inferences ?? [],
          },
        ]),
      ),
    };
    const rubricHash = await canonicalHash(rubric);

    const idealProfile: IdealCandidateProfile = {
      schemaVersion: SCHEMA_VERSION,
      rubricVersion: RUBRIC_VERSION,
      rubricHash,
      roleSummary: rubric.roleSummary,
      dimensions: profileOut.ideal_dimensions ?? [],
    };

    /* ---------- Legacy UI contract via the adapter ---------- */
    const legacyDims = idealProfileToDims(idealProfile);
    const { dimensions } = computeScore(legacyDims);
    const requirements = requirementRecords.map((r) => ({
      text: r.text,
      hard: r.type === "must_have",
      dim:
        (profileOut.requirement_signals ?? []).find((s) => (s.requirementIds ?? []).includes(r.id))
          ?.dimensionKey || "skill",
    })).slice(0, 14);

    const slug = slugId(extract.company || "unknown", extract.title || "role");

    const row = {
      user_id: user?.id ?? null,
      guest_key: user ? null : guestKey,
      slug,
      title: extract.title || "待确认",
      company: extract.company || "待确认",
      location: extract.location || "待确认",
      source_text: text ?? null,
      file_path: filePath ?? null,
      file_name: filePath ? fileName : null,
      status: "succeeded",
      dimensions,
      requirements,
      evidence_items: evidenceItems,
      requirement_records: requirementRecords,
      requirement_signals: profileOut.requirement_signals ?? [],
      evaluation_rubric: rubric,
      rubric_hash: rubricHash,
      rubric_version: RUBRIC_VERSION,
      ideal_profile: idealProfile,
      content_hash: contentHash,
      prompt_version: PROMPT_VER,
      schema_version: SCHEMA_VERSION,
    };

    // Partial unique indexes rule out `upsert`, so resolve the existing row by hand.
    const owner = admin.from("job_profiles").select("id").eq("slug", slug);
    const { data: existing } = await (user ? owner.eq("user_id", user.id) : owner.eq("guest_key", guestKey))
      .maybeSingle();

    const writer = existing
      ? admin.from("job_profiles").update(row).eq("id", existing.id)
      : admin.from("job_profiles").insert(row);
    const { data: job, error } = await writer.select("id, slug, title, company, location").single();
    if (error) throw error;

    // A re-parsed JD invalidates every match built on the previous version.
    if (existing) {
      await admin.from("match_reports").update({ stale: true }).eq("job_profile_id", existing.id);
    }


    if (!user) {
      if (guestRow) {
        await admin.from("guest_trials").update({ jd_parses: guestRow.jd_parses + 1 }).eq("id", guestRow.id);
      } else {
        await admin.from("guest_trials").insert({ guest_key: guestKey, jd_parses: 1 });
      }
    } else {
      await logCall(admin, {
        user_id: user.id,
        task: "parse-jd",
        model: MODEL,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        latency_ms: latency,
      });
    }

    return json({ job, salary: extract.salary || "待确认", dimensions, requirements });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error("parse-jd failed", err);
    const status = err.status === 429 || err.status === 402 ? err.status : 500;
    return json({ error: err.message || "解析失败" }, status);
  }
});
