export const JD_MAX = 30000;
export const STATUSES = ["待投递", "已投递", "面试中", "结束"];

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").trim();
  return s ? s.slice(0, max) : null;
}

export type CleanJob = {
  title: string; company: string | null; location: string | null; salary: string | null;
  source_site: string | null; url: string; jd_text: string | null; status: string; note: string | null;
};

export function cleanJob(body: Record<string, unknown>): { ok: true; job: CleanJob } | { ok: false; error: string } {
  const url = str(body.url, 2000);
  if (!url) return { ok: false, error: "缺少职位链接" };
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, error: "链接格式不正确" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "仅支持 http/https 链接" };
  const title = str(body.title, 200);
  if (!title) return { ok: false, error: "缺少岗位名称" };
  const status = typeof body.status === "string" && STATUSES.includes(body.status) ? body.status : STATUSES[0];
  return {
    ok: true,
    job: {
      title, url: u.toString(), status,
      company: str(body.company, 200), location: str(body.location, 200), salary: str(body.salary, 100),
      source_site: u.hostname, jd_text: str(body.jd_text, JD_MAX), note: str(body.note, 500),
    },
  };
}

const hits = new Map<string, number[]>();
export function rateLimited(userId: string, now = Date.now(), limit = 30): boolean {
  const arr = (hits.get(userId) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(userId, arr);
  return arr.length > limit;
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
