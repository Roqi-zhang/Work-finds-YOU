import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, getUser, logCall } from "../_shared/req.ts";
import { callAIJson, MODEL } from "../_shared/ai.ts";
import { DIMS, computeScore, decisionFlag } from "../_shared/scoring.ts";
import {
  PROMPT_VERSIONS,
  SCHEMA_VERSION,
  matchSchema,
  type DecisionFactor,
  type DimensionMatch,
  type EvidenceItem,
  type EvidenceLink,
} from "../_shared/schemas.ts";
import { decisionFactorsToTrace, dimensionMatchesToDims } from "../_shared/adapter.ts";

const SYSTEM = `你是资深招聘官，对比候选人画像与岗位要求，输出一份可追溯的匹配分析。
规则：
1. 只使用给定的候选人证据与岗位证据，禁止编造事实。
2. dimension_matches 固定 8 条，逐维给出 gapType：
   - met = 现有证据已满足要求；
   - proven_gap = 有充分证据显示候选人能力确实低于要求；
   - evidence_gap = 简历没有足够证据证明，但不能断言候选人不具备；
   - transfer_gap = 有相近能力，但目标场景的迁移尚未被证明；
   - uncertain = 简历或 JD 信息不足，无法可靠判断。
   candidateEvidenceIds / requirementIds 必须指回给定的证据与要求 id；developmentAction 写「为了这个岗位应该提升什么能力」；evidence 一句话说明候选人现状、why 说明判定理由、note 为 6 字以内短标签。
3. judgements 必须依次为「最大优势」「最大缺口」「最大风险」各一条，evidence 中 mine 引候选人证据、required 引岗位要求、reasoning 说明推理、impact 说明对结论的影响。
3.1 **所有面向用户展示的文本（judgements.evidence 的 mine / required / reasoning / impact、dimension_matches 的 evidence / why、steps.items 的 point / suggestion / evidence）一律写人能读懂的具体内容**：直接摘引 JD 原句或简历原句的关键片段（可含关键数字），严禁出现 r1、r2、e10 这类内部证据编号；编号只允许出现在 candidateEvidenceIds / requirementIds 字段里。
4. steps 固定 3 条，kind 依次为 resume、interview、portfolio。这是整份报告最重要的部分，必须**具体到用户可以直接照做**，严禁空话套话。
   - kind=resume：applicable 恒为 true。items 输出 3 条针对这份简历的修改建议，每条：point=一句话说清要改什么；suggestion=可直接复制使用的改写文案或明确到动作的操作步骤（写出真正能粘进简历的中文句子）；evidence=结合 JD 的哪条要求解释为什么这么改。
   - kind=interview：applicable 恒为 true。items 输出 2–3 条，每条：point=点名简历里**哪一段具体经历**最值得准备；suggestion=怎么准备（STAR 拆解要点、需要理清的技术/业务细节、要准备的解决问题实例，越具体越好，从这个岗位面试官想了解什么出发）；evidence=为什么这段经历与该岗位匹配。mindset 写一条面试心态提醒。
   - kind=portfolio：只有当 JD 有明确的作品集/项目集硬性要求时 applicable=true，并给出作品集应重点放什么内容的具体建议（例如 UI 组件规范、交互流程与决策过程、数据驱动的改版复盘）；JD 没有作品集要求时 applicable=false，items 给一条占位即可。
   - 每条 title 简短，desc 一句话概述该步骤。未使用的 mindset 填空字符串。

5. decision_factors 为影响结论的关键因子（不超过 6 条），rationale_summary 为一句话结论依据；不要输出模型的完整内部推演过程。
6. 不要输出任何分数，分数由系统按固定公式计算。
维度：${DIMS.map((d) => `${d.key}=${d.label}`).join("、")}`;

type MatchOut = {
  overview: string;
  dimension_matches: (DimensionMatch & { evidence?: string; why?: string; note?: string })[];
  judgements: Record<string, unknown>[];
  steps: Record<string, unknown>[];
  decision_factors: DecisionFactor[];
  rationale_summary: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "未登录" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobProfileId: string | undefined =
      typeof body.jobProfileId === "string" ? body.jobProfileId.trim() : undefined;
    const candidateProfileId: string | undefined =
      typeof body.candidateProfileId === "string" ? body.candidateProfileId : undefined;
    const force = body.force === true;
    if (!jobProfileId) return json({ error: "jobProfileId 必填" }, 400);

    const admin = adminClient();

    const jobCols =
      "id, title, company, location, dimensions, requirements, evidence_items, requirement_records, requirement_signals, ideal_profile";
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobProfileId);
    const jobKey = isUuid ? "id" : "slug";

    // Navigation may carry either the database UUID or the public job slug. Use the
    // service client for globally de-duplicated JDs, then only claim unowned rows.
    const { data: found, error: jobError } = await admin
      .from("job_profiles")
      .select(jobCols + ", user_id")
      .eq(jobKey, jobProfileId)
      .maybeSingle();
    if (jobError) throw jobError;

    let job: Record<string, unknown> | null = null;
    if (found) {
      if (found.user_id == null) {
        await admin.from("job_profiles").update({ user_id: user.id, guest_key: null }).eq("id", found.id);
      }
      const { user_id: _ignored, ...rest } = found as Record<string, unknown>;
      job = rest;
    }
    if (!job) return json({ error: "岗位画像不存在" }, 404);


    /* ---------- resolve the candidate profile ----------
       Explicit id wins; otherwise the profile built for THIS job;
       otherwise the legacy global current profile. */
    const cols =
      "id, dimensions, sections, version, evidence_items, experience_records, capability_signals, target_job_profile_id";
    let profile: Record<string, unknown> | null = null;

    if (candidateProfileId) {
      const { data } = await admin
        .from("user_profiles").select(cols)
        .eq("id", candidateProfileId).eq("user_id", user.id).maybeSingle();
      profile = data;
    }
    if (!profile) {
      const { data } = await admin
        .from("user_profiles").select(cols)
        .eq("user_id", user.id).eq("target_job_profile_id", job.id).eq("is_current", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      profile = data;
    }
    if (!profile) {
      const { data } = await admin
        .from("user_profiles").select(cols)
        .eq("user_id", user.id).is("target_job_profile_id", null).eq("is_current", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      profile = data;
    }
    if (!profile) return json({ error: "尚未建立个人画像，请先上传简历" }, 409);

    const profileId = profile.id as string;

    /* ---------- cached report for this (profile, job) pair ---------- */
    if (!force) {
      const { data: cached } = await admin
        .from("match_reports")
        .select("*")
        .eq("user_id", user.id)
        .eq("user_profile_id", profileId)
        .eq("job_profile_id", job.id)
        .eq("stale", false)
        .eq("status", "succeeded")
        .maybeSingle();
      if (cached) return json({ report: cached, cached: true, job });
    }

    const resumeEvidence = (profile.evidence_items as EvidenceItem[] | null) ?? [];
    const jdEvidence = (job.evidence_items as EvidenceItem[] | null) ?? [];

    // Prefer the V2 structures; fall back to the v1 flat payload for legacy rows.
    const candidateBlock = profile.capability_signals
      ? `【候选人经历】\n${JSON.stringify(profile.experience_records)}\n\n【候选人能力信号】\n${JSON.stringify(profile.capability_signals)}`
      : `【候选人画像】\n${JSON.stringify(profile.dimensions)}`;
    const jobBlock = job.requirement_signals
      ? `【岗位要求条目】\n${JSON.stringify(job.requirement_records)}\n\n【岗位要求信号】\n${JSON.stringify(job.requirement_signals)}\n\n【理想候选人画像】\n${JSON.stringify(job.ideal_profile)}`
      : `【岗位维度要求】\n${JSON.stringify(job.dimensions)}\n\n【岗位要求条目】\n${JSON.stringify(job.requirements)}`;

    const { data, usage, model, latencyMs } = await callAIJson<MatchOut>({
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `${candidateBlock}\n\n【候选人分段】\n${JSON.stringify(profile.sections)}\n\n` +
                `【岗位】${job.company} · ${job.title} · ${job.location}\n${jobBlock}\n\n` +
                `【候选人原文证据】\n${JSON.stringify(resumeEvidence)}\n\n【岗位原文证据】\n${JSON.stringify(jdEvidence)}`,
            },
          ],
        },
      ],
      schema: matchSchema as unknown as Record<string, unknown>,
      schemaName: "match_report",
      // The custom endpoint frequently blows the wall-clock budget on this large
      // schema —匹配分析统一走稳定低延迟的 Lovable 网关。
      gateway: "lovable",
      timeoutMs: 110_000,
      maxTokens: 8000,
    });

    const dimensionMatches = data.dimension_matches ?? [];
    const legacyDims = dimensionMatchesToDims(dimensionMatches);
    const { score, dimensions, missingCore, scoringVersion } = computeScore(legacyDims);
    const flag = decisionFlag(score);

    const usedIds = new Set(dimensionMatches.flatMap((m) => m.candidateEvidenceIds ?? []));
    const usedReqIds = new Set(dimensionMatches.flatMap((m) => m.requirementIds ?? []));
    const evidenceLinks: EvidenceLink[] = [
      ...resumeEvidence.filter((e) => usedIds.has(e.id)).map((e) => ({ id: e.id, side: "resume" as const, rawQuote: e.rawQuote })),
      ...jdEvidence.filter((e) => usedReqIds.has(e.id)).map((e) => ({ id: e.id, side: "jd" as const, rawQuote: e.rawQuote })),
    ];

    const today = new Date().toISOString().slice(0, 10);

    // Real pipeline record — what this run actually did, rendered in section 04.
    const gapCount = dimensionMatches.filter((m) => m.gapType && m.gapType !== "met").length;
    const reqRecords = (job.requirement_records as unknown[] | null) ?? (job.requirements as unknown[] | null) ?? [];
    const expRecords = (profile.experience_records as unknown[] | null) ?? [];
    const pipeline = [
      { step: "解析 JD", detail: `读取岗位要求条目 ${reqRecords.length} 条、JD 原文证据 ${jdEvidence.length} 条。` },
      { step: "解析画像", detail: `读取 Profile v${profile.version} 的经历 ${expRecords.length} 段、简历原文证据 ${resumeEvidence.length} 条。` },
      { step: "维度对齐", detail: `逐条映射到 8 个能力维度，其中 ${8 - gapCount} 维已满足、${gapCount} 维存在差距。` },
      { step: "加权算分", detail: `按固定权重公式计算，匹配分 ${score}${missingCore.length ? `，核心维度缺失：${missingCore.join("、")}` : ""}。` },
      { step: "生成策略", detail: `由差距归因生成关键判断 ${(data.judgements ?? []).length} 条、投前 ${(data.steps ?? []).length} 步。` },
      { step: "模型调用", detail: `${model}，耗时 ${(latencyMs / 1000).toFixed(1)}s。` },
    ];

    const payload = {
      user_id: user.id,
      user_profile_id: profileId,
      job_profile_id: job.id,
      status: "succeeded" as const,
      score,
      decision: { ...flag, score, overview: data.overview, missingCore },
      judgements: data.judgements,
      steps: data.steps,
      dimension_scores: dimensions,
      pipeline,
      sources: [
        { label: `岗位 JD · ${job.title}, ${job.company}`, at: today },
        { label: `你的画像快照 · Profile v${profile.version}`, at: today },
      ],
      // Legacy field kept alive by the adapter so Match.tsx keeps rendering.
      reasoning_trace: decisionFactorsToTrace(data.decision_factors, data.rationale_summary),
      dimension_matches: dimensionMatches,
      decision_factors: data.decision_factors ?? [],
      rationale_summary: data.rationale_summary ?? null,
      evidence_links: evidenceLinks,
      scoring_version: scoringVersion,
      schema_version: SCHEMA_VERSION,
      stale: false,
    };

    const { data: report, error } = await admin
      .from("match_reports")
      .upsert(payload, { onConflict: "user_profile_id,job_profile_id" })
      .select("*")
      .single();

    const logRow = {
      user_id: user.id,
      task: "run-match",
      model: model || MODEL,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      latency_ms: latencyMs,
    };

    if (error) {
      // no unique constraint yet — fall back to plain insert
      const { data: inserted, error: e2 } = await admin.from("match_reports").insert(payload).select("*").single();
      if (e2) throw e2;
      await logCall(admin, logRow);
      return json({ report: inserted, cached: false, job });
    }

    await logCall(admin, logRow);
    return json({ report, cached: false, job });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error("run-match failed", err);
    const status = err.status === 429 || err.status === 402 ? err.status : 500;
    return json({ error: err.message || "分析失败" }, status);
  }
});
