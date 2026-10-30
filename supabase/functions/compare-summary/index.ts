import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { AIError, callAIText } from "../_shared/ai.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => null);
    const raw = Array.isArray(body?.jobs) ? body.jobs : null;
    if (!raw || raw.length < 2 || raw.length > 6) return json({ error: "请选择 2–6 个岗位" }, 400);
    const jobs = raw.map((j: Record<string, unknown>, i: number) => ({
      label: `岗位${String.fromCharCode(65 + i)}`,
      title: s(j.title, 80),
      company: s(j.company, 60),
      match: Number.isFinite(Number(j.match)) ? Math.round(Number(j.match)) : null,
      requirements: (Array.isArray(j.requirements) ? j.requirements : []).map((r: unknown) => s(r, 160)).filter(Boolean).slice(0, 6),
    }));
    if (jobs.some((j: { title: string }) => !j.title)) return json({ error: "岗位信息不完整" }, 400);

    const lines = jobs
      .map((j: { label: string; company: string; title: string; match: number | null; requirements: string[] }) =>
        `${j.label}：${j.company} · ${j.title}（匹配度 ${j.match ?? "未知"}%）\n要求：${j.requirements.join("；") || "未提供"}`)
      .join("\n\n");

    const { text } = await callAIText({
      maxTokens: 600,
      timeoutMs: 40000,
      messages: [
        {
          role: "system",
          content:
            "你是资深招聘专家。参考大公司评估候选人的通用维度（专业能力深度、经验年限与层级、业务领域、协作与影响范围、成长潜力），用一句不超过 140 字的中文概括所选岗位的核心区别。每次提到岗位都必须写「公司名·岗位全称」（岗位名称与输入完全一致，不得缩写或省略，例如「影石Insta360·AI软件产品经理-2027校招」），每个岗位只提一次，只输出这一句话，不要编号、引号或解释。",
        },
        { role: "user", content: lines },
      ],
    });
    const summary = text.replace(/^["“「]|["”」]$/g, "").split("\n")[0].trim().slice(0, 300);
    if (!summary) return json({ error: "AI 未返回内容，请稍后重试" }, 502);
    return json({ summary });
  } catch (e) {
    if (e instanceof AIError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : "生成失败" }, 500);
  }
});
