import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, fileToBlock, getUser, logCall } from "../_shared/req.ts";
import { callAIJson, type ContentBlock } from "../_shared/ai.ts";
import { DIMS, computeScore, type DimInput } from "../_shared/scoring.ts";

const dimSchema = {
  type: "object",
  additionalProperties: false,
  required: ["dimensions", "sections"],
  properties: {
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
    sections: {
      type: "object",
      additionalProperties: false,
      required: ["experience", "skills", "motivation", "risks"],
      properties: {
        experience: { type: "string" },
        skills: { type: "string" },
        motivation: { type: "string" },
        risks: { type: "string" },
      },
    },
  },
} as const;

const SYSTEM = `你是资深招聘官，负责把候选人简历拆解成 8 个能力维度的证据。
规则：
1. 只依据简历中真实出现的内容给证据，禁止编造。
2. level 判定：strong=有可验证的量化/主导型证据；medium=有描述但缺量化；weak=只有零星提及；missing=简历中完全没有证据。
3. evidence 必须是简历原文的转述或引用（一句话，中文）。
4. why 说明为什么给这个档位；action 给一条具体的补强建议；note 为 6 字以内短标签。
5. 不要输出分数，分数由系统计算。
维度：${DIMS.map((d) => `${d.key}=${d.label}`).join("、")}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "未登录" }, 401);

    const { filePath, fileName } = await req.json().catch(() => ({}));
    if (!filePath || typeof filePath !== "string" || !fileName || typeof fileName !== "string") {
      return json({ error: "filePath 与 fileName 必填" }, 400);
    }
    if (!filePath.startsWith(`${user.id}/`)) return json({ error: "无权访问该文件" }, 403);

    const admin = adminClient();

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
      return json({ error: "文件读取失败：" + msg }, 400);
    }

    const { data, usage, model, latencyMs } = await callAIJson<{
      dimensions: DimInput[];
      sections: Record<string, string>;
    }>({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [{ type: "text", text: "请解析这份简历。" }, block] },
      ],
      schema: dimSchema as unknown as Record<string, unknown>,
      schemaName: "resume_profile",
    });

    const { score, dimensions, scoringVersion } = computeScore(data.dimensions);

    await admin.from("user_profiles").update({ is_current: false }).eq("user_id", user.id).eq("is_current", true);
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
        version: (prev?.version ?? 0) + 1,
        is_current: true,
        status: "succeeded",
        dimensions,
        sections: data.sections,
        scoring_version: scoringVersion,
      })
      .select("id, version")
      .single();
    if (pErr) throw pErr;

    if (resume) await admin.from("resumes").update({ status: "succeeded" }).eq("id", resume.id);
    // any existing report is now based on an outdated profile
    await admin.from("match_reports").update({ stale: true }).eq("user_id", user.id);

    await logCall(admin, {
      user_id: user.id,
      task: "parse-resume",
      model,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      latency_ms: latencyMs,
    });

    return json({ profileId: profile.id, version: profile.version, score, dimensions, sections: data.sections });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error("parse-resume failed", err);
    const status = err.status === 429 || err.status === 402 ? err.status : 500;
    return json({ error: err.message || "解析失败" }, status);
  }
});
