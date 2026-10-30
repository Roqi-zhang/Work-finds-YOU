import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { cleanJob, rateLimited, sha256 } from "./clean.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("x-wfy-token") || "").trim();
  if (!token) return json({ error: "未连接账号" }, 401);
  const { data: tok } = await admin.from("extension_tokens").select("id,user_id,revoked")
    .eq("token_hash", await sha256(token)).maybeSingle();
  if (!tok || tok.revoked) return json({ error: "连接已失效，请重新连接账号" }, 401);
  await admin.from("extension_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tok.id);

  if (req.method === "GET") {
    const url = new URL(req.url).searchParams.get("url");
    if (!url) return json({ ok: true });
    const { data } = await admin.from("saved_jobs").select("id,status").eq("user_id", tok.user_id).eq("url", url).maybeSingle();
    return json({ ok: true, existing: data });
  }
  if (rateLimited(tok.user_id)) return json({ error: "保存太频繁，请稍后再试" }, 429);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "请求格式错误" }, 400); }
  const r = cleanJob(body);
  if (!r.ok) return json({ error: r.error }, 400);
  const { data: prev } = await admin.from("saved_jobs").select("id").eq("user_id", tok.user_id).eq("url", r.job.url).maybeSingle();
  const { data, error } = await admin.from("saved_jobs")
    .upsert({ ...r.job, user_id: tok.user_id, imported_at: null }, { onConflict: "user_id,url" })
    .select("id").single();
  if (error) return json({ error: "保存失败" }, 500);
  return json({ ok: true, id: data.id, updated: !!prev });
});
