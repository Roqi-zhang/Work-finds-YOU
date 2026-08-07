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

const PROFILE_SYSTEM = `你是资深招聘官，基于已经还原好的候选人经历，按给定的「评价标准」判断这份简历**证明了什么能力**。
规则：
1. capability_signals：从经历中提取能力信号，每条必须写明 experienceId 与 evidenceIds，可追溯回原文。一段经历可产生多条信号，一个维度也可由多段经历共同支撑。禁止为不同维度重写同一段经历。
2. candidate_dimensions 固定输出 8 条：${DIMS.map((d) => `${d.key}=${d.label}`).join("、")}。
   - level 依据评价标准中的行为锚点判定：strong=完全达到 strong 锚点且有可验证证据；medium=达到 medium 锚点；weak=只有零星迹象；missing=简历中没有证据。
   - evidenceGroups 按经历分组列出支撑证据，evidenceRole 区分主要/辅助；一段经历一个 group，不要把多家公司的句子拼成一段。
   - why 说明判定理由；note 为 6 字以内短标签。
   - evidenceAction 只回答「这份简历还应该如何补充证据或改进表达」，**不要写「你应该去学什么能力」**，能力提升建议由匹配环节负责。
3. 「没有证据」不等于「能力弱」：找不到证据就填 missing 并在 why 中说明是简历未体现。
4. motive（动机匹配）通常无法只靠简历判断：没有明确求职动机线索时，level 填 missing 并把 sourceStatus 设为 evidence_missing 或 not_applicable_source，禁止编造动机。
5. 只依据给定的经历与原文证据，禁止引入任何简历之外的事实。
6. 严禁输出任何数值分数，分数由后端计算。
7. sections 为四段中文概述：experience / skills / motivation / risks。`;

type ExtractOut = { evidence_items: EvidenceItem[]; experience_records: ExperienceRecord[] };
type ProfileOut = {
  capability_signals: CapabilitySignal[];
  candidate_dimensions: CandidateDimension[];
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
    if (!user) return json({ error: "未登录" }, 401);

    const body = await req.json().catch(() => ({}));
    const { filePath, fileName } = body as { filePath?: string; fileName?: string };
    const targetJobProfileId: string | null =
      typeof body.targetJobProfileId === "string" && body.targetJobProfileId ? body.targetJobProfileId : null;
    if (!filePath || typeof filePath !== "string" || !fileName || typeof fileName !== "string") {
      return json({ error: "filePath 与 fileName 必填" }, 400);
    }
    if (!filePath.startsWith(`${user.id}/`)) return json({ error: "无权访问该文件" }, 403);

    const admin = adminClient();

    /* ---------- target job → evaluation rubric ---------- */
    let rubric: EvaluationRubric | null = null;
    let rubricHash = "no-rubric";
    if (targetJobProfileId) {
      const { data: job } = await admin
        .from("job_profiles")
        .select("id, evaluation_rubric, rubric_hash")
        .eq("id", targetJobProfileId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!job) return json({ error: "目标岗位不存在" }, 404);
      rubric = (job.evaluation_rubric as EvaluationRubric | null) ?? null;
      rubricHash = (job.rubric_hash as string | null) ?? "no-rubric";
    }

    const { data: resume } = await admin
      .from("resumes")
      .insert({ user_id: user.id, file_path: filePath, file_name: fileName, status: "running" })
      .select("id")
      .single();

    let block: ContentBlock;
    try {
      block = (await fileToBlock(admin, "resumes", filePath, fileName)) as ContentBlock;
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

    /* ---------- Call A : Layer 1 + Layer 2 (cacheable, job-agnostic) ---------- */
    let evidenceItems: EvidenceItem[] = [];
    let experienceRecords: ExperienceRecord[] = [];

    const { data: cachedExtract } = await admin
      .from("user_profiles")
      .select("evidence_items, experience_records")
      .eq("user_id", user.id)
      .eq("extraction_fingerprint", extractFp)
      .not("experience_records", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cachedExtract?.experience_records) {
      evidenceItems = (cachedExtract.evidence_items as EvidenceItem[]) ?? [];
      experienceRecords = (cachedExtract.experience_records as ExperienceRecord[]) ?? [];
    } else {
      const a = await callAIJson<ExtractOut>({
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: [{ type: "text", text: "请忠实读取这份简历。" }, block] },
        ],
        schema: resumeExtractionSchema as unknown as Record<string, unknown>,
        schemaName: "resume_extraction",
      });
      promptTokens += a.usage.prompt_tokens;
      completionTokens += a.usage.completion_tokens;
      latency += a.latencyMs;
      evidenceItems = a.data.evidence_items ?? [];
      experienceRecords = a.data.experience_records ?? [];
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
      let q = admin
        .from("user_profiles")
        .select("id, version, dimensions, sections")
        .eq("user_id", user.id)
        .eq("profiling_fingerprint", profileFp)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1);
      q = targetJobProfileId
        ? q.eq("target_job_profile_id", targetJobProfileId)
        : q.is("target_job_profile_id", null);
      const { data: hit } = await q.maybeSingle();
      if (hit) {
        if (resume) await admin.from("resumes").update({ status: "succeeded" }).eq("id", resume.id);
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
    });
    promptTokens += b.usage.prompt_tokens;
    completionTokens += b.usage.completion_tokens;
    latency += b.latencyMs;

    const candidateProfile: CandidateProfile = {
      schemaVersion: SCHEMA_VERSION,
      rubricVersion: RUBRIC_VERSION,
      rubricHash,
      dimensions: b.data.candidate_dimensions ?? [],
      sections: b.data.sections,
    };

    /* ---------- Legacy UI contract via the adapter ---------- */
    const legacyDims = candidateProfileToDims(candidateProfile, evidenceItems);
    const { score, dimensions, scoringVersion } = computeScore(legacyDims);

    // `is_current` is now scoped to the target job, not global.
    let currentQuery = admin
      .from("user_profiles")
      .update({ is_current: false })
      .eq("user_id", user.id)
      .eq("is_current", true);
    currentQuery = targetJobProfileId
      ? currentQuery.eq("target_job_profile_id", targetJobProfileId)
      : currentQuery.is("target_job_profile_id", null);
    await currentQuery;

    const { data: prev } = await admin
      .from("user_profiles")
      .select("version")
      .eq("user_id", user.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: profile, error: pErr } = await admin
      .from("user_profiles")
      .insert({
        user_id: user.id,
        resume_id: resume?.id ?? null,
        target_job_profile_id: targetJobProfileId,
        version: (prev?.version ?? 0) + 1,
        is_current: true,
        status: "succeeded",
        dimensions,
        sections: b.data.sections,
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
    let staleQuery = admin.from("match_reports").update({ stale: true }).eq("user_id", user.id);
    if (targetJobProfileId) staleQuery = staleQuery.eq("job_profile_id", targetJobProfileId);
    await staleQuery;

    await logCall(admin, {
      user_id: user.id,
      task: "parse-resume",
      model: MODEL,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      latency_ms: latency,
    });

    return json({
      profileId: profile.id,
      version: profile.version,
      score,
      dimensions,
      sections: b.data.sections,
    });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error("parse-resume failed", err);
    const status = err.status === 429 || err.status === 402 ? err.status : 500;
    return json({ error: err.message || "解析失败" }, status);
  }
});
