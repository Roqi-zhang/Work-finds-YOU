import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, fileToBlock, getUser, logCall } from "../_shared/req.ts";
import { callAIJson, type ContentBlock } from "../_shared/ai.ts";
import { DIMS, computeScore, type DimInput } from "../_shared/scoring.ts";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "company", "location", "salary", "dimensions", "requirements"],
  properties: {
    title: { type: "string" },
    company: { type: "string" },
    location: { type: "string" },
    salary: { type: "string" },
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
    requirements: {
      type: "array",
      maxItems: 14,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "hard", "dim"],
        properties: {
          text: { type: "string" },
          hard: { type: "boolean" },
          dim: { type: "string", enum: DIMS.map((d) => d.key) },
        },
      },
    },
  },
} as const;

const SYSTEM = `你是资深招聘官，把一份 JD 拆成结构化岗位画像。
规则：
1. 只依据 JD 原文，缺失字段填「待确认」。
2. dimensions 表示该岗位对这 8 个维度的「要求强度」：strong=硬性且反复强调；medium=明确提及；weak=一笔带过；missing=完全没提。
3. evidence 引用 JD 原文的对应句子；why 说明判定理由；action 写候选人应准备什么；note 为 6 字以内短标签。
4. requirements 逐条列出要求，hard=是否硬性，dim=归属维度。
维度：${DIMS.map((d) => `${d.key}=${d.label}`).join("、")}`;

function slugId(co: string, title: string) {
  return `${co}-${title}`.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "") || `jd-${Date.now()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "未登录" }, 401);

    const body = await req.json().catch(() => ({}));
    const text: string | undefined = typeof body.text === "string" ? body.text.slice(0, 60000) : undefined;
    const filePath: string | undefined = typeof body.filePath === "string" ? body.filePath : undefined;
    const fileName: string = typeof body.fileName === "string" ? body.fileName : "jd.txt";
    if (!text && !filePath) return json({ error: "请提供 JD 文本或文件" }, 400);
    if (filePath && !filePath.startsWith(`${user.id}/`)) return json({ error: "无权访问该文件" }, 403);

    const admin = adminClient();

    let block: ContentBlock;
    if (filePath) {
      try {
        block = (await fileToBlock(admin, "resumes", filePath, fileName)) as ContentBlock;
      } catch (e) {
        const msg = String((e as Error).message);
        if (msg === "UNSUPPORTED_DOC") {
          return json({ error: "暂不支持 .doc，请另存为 .docx 或导出 PDF" }, 400);
        }
        return json({ error: "文件读取失败：" + msg }, 400);
      }
    } else {
      block = { type: "text", text: text! };
    }

    const { data, usage, model, latencyMs } = await callAIJson<{
      title: string;
      company: string;
      location: string;
      salary: string;
      dimensions: DimInput[];
      requirements: { text: string; hard: boolean; dim: string }[];
    }>({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [{ type: "text", text: "请解析这份岗位 JD。" }, block] },
      ],
      schema: schema as unknown as Record<string, unknown>,
      schemaName: "job_profile",
    });

    const { dimensions } = computeScore(data.dimensions);
    const slug = slugId(data.company || "unknown", data.title || "role");

    const { data: job, error } = await admin
      .from("job_profiles")
      .insert({
        user_id: user.id,
        slug,
        title: data.title || "待确认",
        company: data.company || "待确认",
        location: data.location || "待确认",
        source_text: text ?? null,
        file_path: filePath ?? null,
        file_name: filePath ? fileName : null,
        status: "succeeded",
        dimensions,
        requirements: data.requirements,
      })
      .select("id, slug, title, company, location")
      .single();
    if (error) throw error;

    await logCall(admin, {
      user_id: user.id,
      task: "parse-jd",
      model,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      latency_ms: latencyMs,
    });

    return json({ job, salary: data.salary, dimensions, requirements: data.requirements });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error("parse-jd failed", err);
    const status = err.status === 429 || err.status === 402 ? err.status : 500;
    return json({ error: err.message || "解析失败" }, status);
  }
});
