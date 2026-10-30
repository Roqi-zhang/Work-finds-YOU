import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sha256 } from "../save-job/clean.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "请先登录" }, 401);
  const body = await req.json().catch(() => ({}));
  if (body?.action === "revoke") {
    await admin.from("extension_tokens").update({ revoked: true }).eq("user_id", u.user.id);
    return json({ ok: true });
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = "wfy_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { error } = await admin.from("extension_tokens").insert({ user_id: u.user.id, token_hash: await sha256(token) });
  if (error) return json({ error: "生成失败" }, 500);
  return json({ ok: true, token, email: u.user.email });
});
