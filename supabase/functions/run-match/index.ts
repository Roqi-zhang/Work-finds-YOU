import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, getUser, logCall } from "../_shared/req.ts";
import { callAIJson } from "../_shared/ai.ts";
import { DIMS, computeScore, decisionFlag, type DimInput } from "../_shared/scoring.ts";

const evidenceObj = {
  type: "object",
  additionalProperties: false,
  required: ["mine", "required", "reasoning", "impact"],
  properties: {
    mine: { type: "string" },
    required: { type: "string" },
    reasoning: { type: "string" },
    impact: { type: "string" },
  },
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "dimensions", "judgements", "steps", "trace"],
  properties: {
    overview: { type: "string" },
    dimensions: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "level", "evidence", "why", "action", "note"],
        properties: {
          key: { type: "string", enum: DIMS.map((d) => d.key) },
          level: { type: "string", enum: ["strong", "medium", "weak", "missing"] },
          evidence: { type: "string" },
          why: { type: "string" },
          action: { type: "string" },
          note: { type: "string" },
        },
      },
    },
    judgements: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "desc", "tags", "evidence"],
        properties: {
          kind: { type: "string", enum: ["最大优势", "最大缺口", "最大风险"] },
          title: { type: "string" },
          desc: { type: "string" },
          tags: { type: "array", maxItems: 3, items: { type: "string" } },
          evidence: evidenceObj,
        },
      },
    },
    steps: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "desc", "why", "effect", "sample"],
        properties: {
          title: { type: "string" },
          desc: { type: "string" },
          why: { type: "string" },
          effect: { type: "string" },
          sample: { type: "string" },
        },
      },
    },
    trace: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["step", "detail"],
        properties: { step: { type: "string" }, detail: { type: "string" } },
      },
    },
  },
} as const;

const SYSTEM = `你是资深招聘官，对比候选人画像与岗位要求，输出一份可追溯的匹配分析。
规则：
1. 只使用给定的候选人证据与 JD 证据，禁止编造事实。
2. dimensions 表示候选人在该岗位语境下每个维度的达标情况：strong=完全满足且有证据；medium=部分满足；weak=证据薄弱；missing=无证据。
3. judgements 必须依次为「最大优势」「最大缺口」「最大风险」各一条，evidence 中 mine 引用候选人证据、required 引用 JD 要求、reasoning 说明推理、impact 说明对结论的影响。
4. steps 为投前 3 步：分别针对简历、作品集/项目表达、面试准备，desc 必须具体可执行，sample 给一段可直接复用的中文示例文字。
5. 不要输出任何分数，分数由系统按固定公式计算。
维度：${DIMS.map((d) => `${d.key}=${d.label}`).join("、")}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "未登录" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobProfileId: string | undefined = body.jobProfileId;
    const force = body.force === true;
    if (!jobProfileId) return json({ error: "jobProfileId 必填" }, 400);

    const admin = adminClient();

    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, dimensions, sections, version")
      .eq("user_id", user.id)
      .eq("is_current", true)
      .maybeSingle();
    if (!profile) return json({ error: "尚未建立个人画像，请先上传简历" }, 409);

    const { data: job } = await admin
      .from("job_profiles")
      .select("id, title, company, location, dimensions, requirements")
      .eq("id", jobProfileId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!job) return json({ error: "岗位画像不存在" }, 404);

    // cached report for the same (profile version, job) pair
    if (!force) {
      const { data: cached } = await admin
        .from("match_reports")
        .select("*")
        .eq("user_id", user.id)
        .eq("user_profile_id", profile.id)
        .eq("job_profile_id", job.id)
        .eq("stale", false)
        .eq("status", "succeeded")
        .maybeSingle();
      if (cached) return json({ report: cached, cached: true, job });
    }

    const { data, usage, model, latencyMs } = await callAIJson<{
      overview: string;
      dimensions: DimInput[];
      judgements: Record<string, unknown>[];
      steps: Record<string, unknown>[];
      trace: { step: string; detail: string }[];
    }>({
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `【候选人画像】\n${JSON.stringify(profile.dimensions)}\n\n【候选人分段】\n${JSON.stringify(profile.sections)}\n\n` +
                `【岗位】${job.company} · ${job.title} · ${job.location}\n【岗位维度要求】\n${JSON.stringify(job.dimensions)}\n\n` +
                `【岗位要求条目】\n${JSON.stringify(job.requirements)}`,
            },
          ],
        },
      ],
      schema: schema as unknown as Record<string, unknown>,
      schemaName: "match_report",
    });

    const { score, dimensions, missingCore, scoringVersion } = computeScore(data.dimensions);
    const flag = decisionFlag(score);

    const payload = {
      user_id: user.id,
      user_profile_id: profile.id,
      job_profile_id: job.id,
      status: "succeeded" as const,
      score,
      decision: { ...flag, score, overview: data.overview, missingCore },
      judgements: data.judgements,
      steps: data.steps,
      dimension_scores: dimensions,
      sources: [
        { label: `岗位 JD · ${job.title}, ${job.company}`, at: new Date().toISOString().slice(0, 10) },
        { label: `你的画像快照 · Profile v${profile.version}`, at: new Date().toISOString().slice(0, 10) },
      ],
      reasoning_trace: JSON.stringify(data.trace),
      scoring_version: scoringVersion,
      stale: false,
    };

    const { data: report, error } = await admin
      .from("match_reports")
      .upsert(payload, { onConflict: "user_profile_id,job_profile_id" })
      .select("*")
      .single();
    if (error) {
      // no unique constraint yet — fall back to plain insert
      const { data: inserted, error: e2 } = await admin.from("match_reports").insert(payload).select("*").single();
      if (e2) throw e2;
      await logCall(admin, { user_id: user.id, task: "run-match", model, latency_ms: latencyMs, prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens });
      return json({ report: inserted, cached: false, job });
    }

    await logCall(admin, {
      user_id: user.id,
      task: "run-match",
      model,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      latency_ms: latencyMs,
    });

    return json({ report, cached: false, job });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error("run-match failed", err);
    const status = err.status === 429 || err.status === 402 ? err.status : 500;
    return json({ error: err.message || "分析失败" }, status);
  }
});
