import { supabase } from "@/integrations/supabase/client";
import { getGuestKey } from "@/lib/guest";
export type RoleSource = { id: string; tier: string; title: string; publisher: string; url: string; publishedAt: string | null; retrievedAt: string; excerpt: string; locator: string; contentHash: string };
export type RoleEntry = { dimensionKey: string; title: string; explanation: string; behaviors: string[]; validEvidence: string[]; sourceIds: string[]; requirementIds: string[]; basis: string; strong: string; medium: string; weak: string };
export type RoleKnowledge = { snapshotId: string; version: string; summary: string; sources: RoleSource[]; entries: RoleEntry[]; retrievedAt: string; packStatus: string; packVersion: string | null; disclaimer: string; attribution: string };

export async function researchRole(jobProfileId: string, onProgress: (s: string) => void): Promise<RoleKnowledge> {
  const { data: auth } = await supabase.auth.getSession();
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/role-knowledge`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${auth.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ jobProfileId, guestKey: getGuestKey() }),
  });
  if (!response.ok) { const body = await response.json(); throw new Error(body.error || "资料补全暂不可用"); }
  if (!response.headers.get("content-type")?.includes("ndjson")) return response.json();
  const reader = response.body?.getReader();
  if (!reader) throw new Error("未收到资料补全结果");
  const decoder = new TextDecoder();
  let pending = "", result: RoleKnowledge | null = null;
  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split("\n"); pending = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const item = JSON.parse(line);
      if (item.error) throw new Error(item.error);
      if (item.progress) onProgress(item.progress);
      if (item.result) result = item.result;
    }
    if (done) break;
  }
  if (!result) throw new Error("补全未完成，基础画像仍可使用");
  return result;
}
export async function adoptRole(jobProfileId: string, snapshotId: string) {
  const { data, error } = await supabase.functions.invoke("role-knowledge", { body: { action: "adopt", jobProfileId, snapshotId, guestKey: getGuestKey() } });
  if (error) { const context = (error as { context?: Response }).context; throw new Error(context ? (await context.json()).error : error.message); }
  return data.jobId as string;
}