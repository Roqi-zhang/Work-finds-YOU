import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, fileToBlock, getUser, logCall } from "../_shared/req.ts";
import { callAIJson, MODEL, type ContentBlock } from "../_shared/ai.ts";
import { DIMS, computeScore } from "../_shared/scoring.ts";
import {
  PROMPT_VERSIONS,
  RUBRIC_VERSION,
  SCHEMA_VERSION,
  resumeExtractionSchema,
  resumeProfilingSchema,
  type CandidateDimension,
  type CandidateProfile,
  type CapabilitySignal,
  type EvaluationRubric,
  type EvidenceItem,
  type ExperienceRecord,
} from "../_shared/schemas.ts";
import { candidateProfileToDims } from "../_shared/adapter.ts";
import { extractionFingerprint, profilingFingerprint, sha256Hex } from "../_shared/hash.ts";
import { getAnalysis, putAnalysis, recordDocument } from "../_shared/docstore.ts";

/* -------- Layer 1 + 2 : STRICTLY job-agnostic. No JD, no rubric, ever. -------- */

const EXTRACT_SYSTEM = `你是资深招聘官，负责忠实读取一份简历，不做任何评价、不做任何岗位匹配。
规则：
1. evidence_items 必须是简历的**原文摘录**（rawQuote 逐字引用，不得改写、不得总结、不得润色），id 用 e1、e2… 递增，section 填该句所在的板块名。
2. experience_records 把每一段工作 / 实习 / 项目还原为**完整上下文**，一段经历只建立一条记录，id 用 x1、x2… 递增，evidenceIds 指回 evidence_items。
3. 字段含义：context=背景，objective=目标，responsibilities=职责，actions=具体做法，outcomes=结果，metrics=量化指标（原文有才填），tools=工具/技术，collaboration=协作对象与方式。
4. 严禁：打分、判定强弱、归类到能力维度、推断简历上没写的内容、为了凑字数编造数字。
5. 简历里没有的信息一律留空数组或空字符串，不要猜。
6. 精简输出：evidence_items 不超过 20 条，每条 rawQuote 不超过 60 字；每段经历的 actions / outcomes 各不超过 4 条，每条不超过 40 字。`;

/* -------- Layer 3 + 4 : judged against the JD-derived rubric ------------------ */

const PROFILE_SYSTEM = `你是一位资深 HR，非常熟悉候选人能力模型，擅长从候选人的叙述中读出他真实的能力与特质。基于已经还原好的候选人经历，按给定的「评价标准」判断这份简历**证明了什么能力**。
规则：
1. capability_signals：从经历中提取能力信号，每条必须写明 experienceId 与 evidenceIds，可追溯回原文。一段经历可产生多条信号，一个维度也可由多段经历共同支撑。禁止为不同维度重写同一段经历。
2. candidate_dimensions 固定输出 8 条：${DIMS.map((d) => `${d.key}=${d.label}`).join("、")}。
   - level 依据评价标准中的行为锚点判定：strong=完全达到 strong 锚点且有可验证证据；medium=达到 medium 锚点；weak=只有零星迹象；missing=简历中没有证据。
   - evidenceGroups 按经历分组列出支撑证据，evidenceRole 区分主要/辅助；一段经历一个 group，不要把多家公司的句子拼成一段。
   - why 是这一维的核心分析：**严禁复述简历原句**，必须从经历中提炼出候选人体现了什么能力与特质（例如结构化思考、端到端推进力、跨职能协调、抗压与复盘习惯），并说明是从哪种行为推断出来的，控制在 120 字左右。
   - note 为 6 字以内短标签。
   - evidenceAction 只回答「这份简历还应该如何补充证据或改进表达」，**不要写「你应该去学什么能力」**，能力提升建议由匹配环节负责。
3. key_points 固定 3 条：这份简历体现出的**最突出的 3 项能力**。title 为 8 字以内短标题，detail 用一句话（40 字以内）说明由哪段经历的哪种行为体现出来，不要复述简历原句。
4. 「没有证据」不等于「能力弱」：找不到证据就填 missing 并在 why 中说明是简历未体现。
5. motive（动机匹配）通常无法只靠简历判断：没有明确求职动机线索时，level 填 missing 并把 sourceStatus 设为 evidence_missing 或 not_applicable_source，禁止编造动机。
6. 只依据给定的经历与原文证据，禁止引入任何简历之外的事实。
7. 严禁输出任何数值分数，分数由后端计算。
8. sections 为四段中文概述：experience / skills / motivation / risks。`;


type ExtractOut = { evidence_items: EvidenceItem[]; experience_records: ExperienceRecord[] };
type ProfileOut = {
  capability_signals: CapabilitySignal[];
  candidate_dimensions: CandidateDimension[];
  key_points?: { title: string; detail: string }[];
  sections: { experience: string; skills: string; motivation: string; risks: string };
};


/** Fallback rubric wording when the user reaches /profile without a target JD. */
const GENERIC_RUBRIC_NOTE =
  "（本次没有指定目标岗位，请按该维度的通用职业标准判断，判断需保守、以证据为准。）";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const user = await getUser(req);

    const body = await req.json().catch(() => ({}));
    const { filePath, fileName } = body as { filePath?: string; fileName?: string };
    const fileData: string | undefined = typeof body.fileData === "string" ? body.fileData : undefined;
    const guestKey: string = typeof body.guestKey === "string" ? body.guestKey.slice(0, 64) : "";
    const targetJobProfileId: string | null =
      typeof body.targetJobProfileId === "string" && body.targetJobProfileId ? body.targetJobProfileId : null;
    if (!fileName || typeof fileName !== "string") return json({ error: "fileName 必填" }, 400);
    if (!filePath && !fileData) return json({ error: "请提供简历文件" }, 400);
    if (user && filePath && !filePath.startsWith(`${user.id}/`)) return json({ error: "无权访问该文件" }, 403);
    if (!user && !guestKey) return json({ error: "请先登录后再使用 AI 分析" }, 401);

    const admin = adminClient();

    /** Scope every ownership query to the account, or to the guest device. */
    const scopeKey = user ? user.id : `guest:${guestKey}`;
    // deno-lint-ignore no-explicit-any
    const own = (q: any) => (user ? q.eq("user_id", user.id) : q.is("user_id", null).eq("guest_key", guestKey));

    /* ---------- quota gate ---------- */
    let guestRow: GuestRow | null = null;
    if (user) {
      const q = await getDailyUsage(admin, user.id, user.email);
      if (q.remaining <= 0) return json({ error: QUOTA_MESSAGE.daily, code: "QUOTA_EXCEEDED" }, 429);
    } else {
      guestRow = await getGuestTrial(admin, guestKey);
      if (guestRow && guestRow.resume_parses >= GUEST_LIMIT) {
        return json({ error: QUOTA_MESSAGE.guest }, 401);
      }
    }

    /* ---------- target job → evaluation rubric ---------- */
    let rubric: EvaluationRubric | null = null;
    let rubricHash = "no-rubric";
    let targetJobId = targetJobProfileId;
    if (targetJobId) {
      const { data: job } = await admin
        .from("job_profiles")
        .select("id, user_id, guest_key, evaluation_rubric, rubric_hash")
        .eq("id", targetJobId)
        .maybeSingle();
      const owned =
        !!job &&
        (user
          ? job.user_id === user.id || (!job.user_id && !!guestKey && job.guest_key === guestKey)
          : !job.user_id && job.guest_key === guestKey);
      if (owned) {
        // A JD parsed during the guest trial now belongs to this account.
        if (user && !job!.user_id) {
          await admin.from("job_profiles").update({ user_id: user.id, guest_key: null }).eq("id", job!.id);
        }
        rubric = (job!.evaluation_rubric as EvaluationRubric | null) ?? null;
        rubricHash = (job!.rubric_hash as string | null) ?? "no-rubric";
      } else {
        // Stale or foreign target id — grade against the generic rubric instead of failing.
        console.warn("target job not accessible, falling back to generic rubric", targetJobId);
        targetJobId = null;
      }
    }

    // Guests have no storage access, so their file travels inline and gets no resume row.
    const resume = user && filePath
      ? (await admin
          .from("resumes")
          .insert({ user_id: user.id, file_path: filePath, file_name: fileName, status: "running" })
          .select("id")
          .single()).data
      : null;

    let block: ContentBlock;
    try {
      block = (filePath
        ? await fileToBlock(admin, "resumes", filePath, fileName)
        : await bufferToBlock(decodeBase64(fileData!), fileName)) as ContentBlock;
    } catch (e) {
      const msg = String((e as Error).message);
      if (resume) await admin.from("resumes").update({ status: "failed", error: msg }).eq("id", resume.id);
      if (msg === "UNSUPPORTED_DOC") {
        return json({ error: "暂不支持 .doc，请在 Word 中另存为 .docx 或导出 PDF 后重新上传" }, 400);
      }
      if (msg === "UNREADABLE_PDF") {
        return json({ error: "该 PDF 无法提取文字（可能是扫描件），请上传可复制文字的 PDF/DOCX，或改传截图" }, 400);
      }
      return json({ error: "文件读取失败：" + msg }, 400);
    }

    const contentHash = await sha256Hex(
      block.type === "text" ? block.text : JSON.stringify(block).slice(0, 200000),
    );
    const extractFp = await extractionFingerprint({
      contentHash,
      promptVersion: PROMPT_VERSIONS.resumeExtraction,
      schemaVersion: SCHEMA_VERSION,
      model: MODEL,
    });

    let promptTokens = 0;
    let completionTokens = 0;
    let latency = 0;

    await recordDocument(admin, {
      contentHash,
      kind: "resume",
      ownerId: user?.id ?? null,
      textLen: block.type === "text" ? block.text.length : undefined,
      storagePath: filePath ?? null,
      fileName,
    });

    // Resume analyses are private — the cache scope is the owner, never global.
    const extractKey = {
      contentHash,
      kind: "resume" as const,
      stage: "resume_extract",
      promptVersion: PROMPT_VERSIONS.resumeExtraction,
      schemaVersion: SCHEMA_VERSION,
      scopeKey,
    };

    /* ---------- Call A : Layer 1 + Layer 2 (cacheable, job-agnostic) ---------- */
    let evidenceItems: EvidenceItem[] = [];
    let experienceRecords: ExperienceRecord[] = [];

    const { data: cachedExtract } = await own(
      admin
        .from("user_profiles")
        .select("evidence_items, experience_records"),
    )
      .eq("extraction_fingerprint", extractFp)
      .not("experience_records", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();


    const cachedDoc = cachedExtract?.experience_records
      ? null
      : await getAnalysis<ExtractOut>(admin, extractKey);

    if (cachedExtract?.experience_records) {
      evidenceItems = (cachedExtract.evidence_items as EvidenceItem[]) ?? [];
      experienceRecords = (cachedExtract.experience_records as ExperienceRecord[]) ?? [];
    } else if (cachedDoc) {
      evidenceItems = cachedDoc.evidence_items ?? [];
      experienceRecords = cachedDoc.experience_records ?? [];
    } else {
      const a = await callAIJson<ExtractOut>({
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: [{ type: "text", text: "请忠实读取这份简历。" }, block] },
        ],
        schema: resumeExtractionSchema as unknown as Record<string, unknown>,
        schemaName: "resume_extraction",
        // 自有端点在大 schema 上经常跑满时钟预算，简历解析统一走低延迟的 Lovable 网关。
        gateway: "lovable",
        timeoutMs: 60_000,
        maxTokens: 8000,
      });

      promptTokens += a.usage.prompt_tokens;
      completionTokens += a.usage.completion_tokens;
      latency += a.latencyMs;
      evidenceItems = a.data.evidence_items ?? [];
      experienceRecords = a.data.experience_records ?? [];
      await putAnalysis(admin, extractKey, a.data, a.model);
    }

    const profileFp = await profilingFingerprint({
      extractionFingerprint: extractFp,
      rubricHash,
      promptVersion: PROMPT_VERSIONS.resumeProfiling,
      schemaVersion: SCHEMA_VERSION,
      model: MODEL,
    });

    /* ---------- Cache short-circuit : same resume + same rubric ---------- */
    {
      let q = own(
        admin
          .from("user_profiles")
          .select("id, version, dimensions, sections"),
      )
        .eq("profiling_fingerprint", profileFp)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1);
      q = targetJobId
        ? q.eq("target_job_profile_id", targetJobId)
        : q.is("target_job_profile_id", null);
      const { data: hit } = await q.maybeSingle();
      if (hit) {
        if (resume) await admin.from("resumes").update({ status: "succeeded" }).eq("id", resume.id);
        let clear = own(
          admin
            .from("user_profiles")
            .update({ is_current: false }),
        )
          .eq("is_current", true)
          .neq("id", hit.id);
        clear = targetJobId
          ? clear.eq("target_job_profile_id", targetJobId)
          : clear.is("target_job_profile_id", null);
        await clear;
        await admin.from("user_profiles").update({ is_current: true }).eq("id", hit.id);
        const cachedScore = computeScore((hit.dimensions ?? []) as never).score;
        return json({
          profileId: hit.id,
          version: hit.version,
          score: cachedScore,
          dimensions: hit.dimensions,
          sections: hit.sections,
          cached: true,
        });
      }
    }

    /* ---------- Call B : Layer 3 + Layer 4 (rubric-aware) ---------- */
    const rubricText = rubric
      ? `【本岗位评价标准】\n${JSON.stringify(rubric)}`
      : `【评价标准】通用标准。${GENERIC_RUBRIC_NOTE}`;

    const b = await callAIJson<ProfileOut>({
      messages: [
        { role: "system", content: PROFILE_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `${rubricText}\n\n【候选人经历】\n${JSON.stringify(experienceRecords)}\n\n` +
                `【原文证据】\n${JSON.stringify(evidenceItems)}`,
            },
          ],
        },
      ],
      schema: resumeProfilingSchema as unknown as Record<string, unknown>,
      schemaName: "resume_profiling",
      gateway: "lovable",
      timeoutMs: 80_000,
      maxTokens: 8000,
    });

    promptTokens += b.usage.prompt_tokens;
    completionTokens += b.usage.completion_tokens;
    latency += b.latencyMs;

    const keyPoints = (b.data.key_points ?? []).slice(0, 3);
    const candidateProfile: CandidateProfile = {
      schemaVersion: SCHEMA_VERSION,
      rubricVersion: RUBRIC_VERSION,
      rubricHash,
      dimensions: b.data.candidate_dimensions ?? [],
      keyPoints,
      sections: b.data.sections,
    };


    /* ---------- Legacy UI contract via the adapter ---------- */
    const legacyDims = candidateProfileToDims(candidateProfile, evidenceItems);
    const { score, dimensions, scoringVersion } = computeScore(legacyDims);

    // `is_current` is now scoped to the target job, not global.
    let currentQuery = own(
      admin
        .from("user_profiles")
        .update({ is_current: false }),
    ).eq("is_current", true);
    currentQuery = targetJobId
      ? currentQuery.eq("target_job_profile_id", targetJobId)
      : currentQuery.is("target_job_profile_id", null);
    await currentQuery;

    const { data: prev } = await own(
      admin
        .from("user_profiles")
        .select("version"),
    )
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: profile, error: pErr } = await admin
      .from("user_profiles")
      .insert({
        user_id: user?.id ?? null,
        guest_key: user ? null : guestKey,
        resume_id: resume?.id ?? null,
        target_job_profile_id: targetJobId,
        version: (prev?.version ?? 0) + 1,
        is_current: true,
        status: "succeeded",
        dimensions,
        sections: { ...b.data.sections, keyPoints },

        scoring_version: scoringVersion,
        evidence_items: evidenceItems,
        experience_records: experienceRecords,
        capability_signals: b.data.capability_signals ?? [],
        rubric_hash: rubricHash,
        rubric_version: RUBRIC_VERSION,
        extraction_fingerprint: extractFp,
        profiling_fingerprint: profileFp,
        prompt_version: `${PROMPT_VERSIONS.resumeExtraction}+${PROMPT_VERSIONS.resumeProfiling}`,
        schema_version: SCHEMA_VERSION,
      })
      .select("id, version")
      .single();
    if (pErr) throw pErr;

    if (resume) await admin.from("resumes").update({ status: "succeeded" }).eq("id", resume.id);

    // Only reports for this target job become stale — a resume aimed at another
    // JD must not invalidate unrelated history.
    let staleQuery = own(admin.from("match_reports").update({ stale: true }));
    if (targetJobId) staleQuery = staleQuery.eq("job_profile_id", targetJobId);
    await staleQuery;

    if (user) {
      await consumeDaily(admin, user.id, "resume");
      await logCall(admin, {
        user_id: user.id,
        task: "parse-resume",
        model: MODEL,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        latency_ms: latency,
      });
    } else {
      await consumeGuest(admin, guestKey, "resume");
    }


    return json({
      profileId: profile.id,
      version: profile.version,
      score,
      dimensions,
      keyPoints,
      sections: b.data.sections,
    });

  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error("parse-resume failed", err);
    const status = err.status === 429 || err.status === 402 ? err.status : 500;
    return json({ error: err.message || "解析失败" }, status);
  }
});
