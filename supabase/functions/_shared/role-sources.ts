import { canonicalHash, sha256Hex } from "./hash.ts";
import { publicUrl, type KnowledgeSource } from "./role-policy.ts";
import pinnedEsco from "./esco-snapshot.json" with { type: "json" };

const ESCO_PRODUCT = "http://data.europa.eu/esco/occupation/a79170ad-0b7b-4697-864f-1748359aa10a";
const ESCO_UI = "http://data.europa.eu/esco/occupation/96e20037-0a25-4bf6-a25e-808d1605d890";

export class ResearchError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Public job-research channels. Community content stays contextual, never scoring evidence. */
export const SOURCE_GROUPS = [
  { platform: "小红书", sites: ["xiaohongshu.com"], lang: "zh" },
  { platform: "知乎", sites: ["zhihu.com"], lang: "zh" },
  { platform: "牛客 / 看准 / 脉脉", sites: ["nowcoder.com", "kanzhun.com", "maimai.cn"], lang: "zh" },
  { platform: "BOSS直聘 / 拉勾 / 猎聘", sites: ["zhipin.com", "lagou.com", "liepin.com"], lang: "zh" },
  { platform: "百度", sites: [], lang: "zh" },
  { platform: "Glassdoor / Levels.fyi", sites: ["glassdoor.com", "levels.fyi"], lang: "en" },
  { platform: "Reddit / Blind / LinkedIn", sites: ["reddit.com", "teamblind.com", "linkedin.com"], lang: "en" },
  { platform: "Google", sites: [], lang: "en" },
  { platform: "O*NET", sites: ["onetonline.org"], lang: "en" },
] as const;

export function platformOf(host: string): string {
  for (const g of SOURCE_GROUPS) if (g.sites.some(d => host === d || host.endsWith("." + d))) return g.platform.split(" / ").find((_, i) => host.includes(g.sites[i]?.split(".")[0] ?? "")) || g.platform;
  return host;
}

export function groupQueries(zh: string, en: string) {
  return SOURCE_GROUPS.map(g => {
    const base = g.lang === "zh" ? zh : en;
    const sites = g.sites.length ? " (" + g.sites.map(d => `site:${d}`).join(" OR ") + ")" : "";
    return { platform: g.platform, query: `${base}${sites}`.trim(), lang: g.lang };
  });
}

/** Runs every channel in parallel; a failed channel is recorded, not fatal. */
export async function multiSearch(zh: string, en: string): Promise<{ sources: KnowledgeSource[]; missing: string[] }> {
  const queries = groupQueries(zh, en);
  const results = await Promise.all(queries.map(q => firecrawlSearch(q.query, 2, q.lang).catch(e => { if (e instanceof ResearchError && (e.status === 402 || e.status === 403)) throw e; console.error("channel failed", q.platform, String(e)); return []; })));
  const sources: KnowledgeSource[] = [];
  const missing: string[] = [];
  results.forEach((rows, i) => {
    if (!rows.length) missing.push(queries[i].platform);
    for (const r of rows) if (!sources.some(s => s.url === r.url)) sources.push({ ...r, id: `web-${sources.length + 1}` });
  });
  return { sources, missing };
}

export async function firecrawlSearch(query: string, limit = 4, lang = "zh"): Promise<KnowledgeSource[]> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  const aiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!key || !aiKey) throw new ResearchError(503, "可靠检索服务尚未配置");
  const response = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/search", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}`, "X-Connection-Api-Key": key },
    body: JSON.stringify({ query, limit, lang, scrapeOptions: { formats: ["markdown"] } }),
  });
  if (!response.ok) throw new ResearchError(response.status, (await response.text()).slice(0, 1500));
  const raw = await response.json();
  if (raw.success === false) throw new ResearchError(502, raw.error || "检索失败");
  const rows = Array.isArray(raw.data) ? raw.data : raw.data?.web ?? [];
  const now = new Date().toISOString();
  const sources: KnowledgeSource[] = [];
  for (const row of rows) {
    const url = publicUrl(row.url || "");
    const fullText = String(row.markdown || "");
    const excerpt = fullText.slice(0, 6500);
    if (!url || excerpt.length < 100 || sources.some(s => s.url === url)) continue;
    const host = new URL(url).hostname;
    const official = host === "www.onetonline.org" && /^\/link\/summary\/\d{2}-\d{4}\.\d{2}$/.test(new URL(url).pathname);
    // Unknown web publishers stay contextual. AI cannot relabel them as official.
    sources.push({ id: `web-${sources.length + 1}`, tier: official ? "occupational_standard" : "interview_reference",
      title: String(row.title || host), publisher: host, platform: platformOf(host), url, excerpt,
      publishedAt: typeof row.metadata?.publishedTime === "string" ? row.metadata.publishedTime : null,
      retrievedAt: now, contentHash: await sha256Hex(fullText), locator: "公开网页正文 · 摘录前6500字符，哈希覆盖获取正文" });
  }
  return sources;
}

export async function standardSources(family: string | null): Promise<KnowledgeSource[]> {
  if (!family) return [];
  const design = family.includes("design");
  const uri = design ? ESCO_UI : ESCO_PRODUCT;
  const url = `https://ec.europa.eu/esco/api/resource/occupation?uri=${encodeURIComponent(uri)}&language=en&selectedVersion=v1.2.1`;
  const snapshot = design ? pinnedEsco.design : pinnedEsco.product;
  const data = snapshot.data;
  const excerpt = JSON.stringify({ title: data.title, description: data.description, preferredLabel: data.preferredLabel,
    skills: data._links?.hasEssentialSkill, optionalSkills: data._links?.hasOptionalSkill }).slice(0, 14000);
  if (excerpt.length < 100) return [];
  return [{ id: "esco-occupation", tier: "occupational_standard", title: design ? "ESCO · User interface designer" : "ESCO · ICT product manager",
    publisher: "European Commission · ESCO", url, publishedAt: null, retrievedAt: snapshot.retrievedAt,
    contentHash: await canonicalHash(data), excerpt, locator: `${uri} · selectedVersion=v1.2.1` }];
}