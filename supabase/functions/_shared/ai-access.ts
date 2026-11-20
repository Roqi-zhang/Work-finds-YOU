import { adminClient } from "./req.ts";

// Persist only a hash of the endpoint/model, never credentials or request content.
export async function accessScope(url: string, model: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${url}|${model}`));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

export async function blockedAccess(scope: string) {
  const { data, error } = await adminClient().from("ai_provider_access_blocks").select("message").eq("scope", scope).maybeSingle();
  if (error) throw new Error("无法确认 AI 服务权限状态，请稍后再试");
  return data?.message as string | undefined;
}

export async function blockAccess(scope: string, message: string) {
  const { error } = await adminClient().from("ai_provider_access_blocks").upsert({ scope, status: 403, message });
  if (error) throw new Error("无法保存 AI 服务暂停状态");
}