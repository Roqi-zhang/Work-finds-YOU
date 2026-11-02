import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { AIError, callAIJson, callAIText } from "../_shared/ai.ts";
import { adminClient, getUser } from "../_shared/req.ts";
import { publicUrl } from "../_shared/role-policy.ts";
import { platformOf } from "../_shared/role-sources.ts";
import { INTERVIEW_PLATFORMS, interviewQueries, looksLikeInterview, platformLinks, rankLinks, type Candidate, type Judgement } from "../_shared/interview-policy.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function keys() {
  const key = Deno.env.get("FIRECRAWL_API_KEY"), ai = Deno.env.get("LOVABLE_API_KEY");
  if (!key || !ai) throw new Response(JSON.stringify({ error: "搜索服务尚未配置" }), { status: 503 });
  return { "Content-Type": "application/json", Authorization: `Bearer ${ai}`, "X-Connection-Api-Key": key };
}

type Row = Candidate & { snippet: string };

async function search(query: string, lang: string): Promise<Row[]> {
  const res = await fetch(`${GATEWAY}/search`, { method: "POST", headers: keys(), body: JSON.stringify({ query, limit: 5, lang, tbs: "qdr:y" }) });
  if (!res.ok) { console.error("search failed", res.status, (await res.text()).slice(0, 300)); return []; }
  const raw = await res.json();
  const rows = Array.isArray(raw.data) ? raw.data : raw.data?.web ?? [];
  return rows.map((r: Record<string, any>) => {
    const url = publicUrl(String(r.url || ""));
    if (!url) return null;
    const date = r.date || r.metadata?.publishedTime || null;
    return { id: "", url, title: s(r.title, 160) || url, snippet: s(r.description || r.snippet, 400), platform: platformOf(new URL(url).hostname), publishedAt: typeof date === "string" && !isNaN(Date.parse(date)) ? new Date(date).toISOString().slice(0, 10) : null };
  }).filter(Boolean) as Row[];
}

async function runSearch(title: string, company: string) {
  const q = interviewQueries(title, company);
  const queries = INTERVIEW_PLATFORMS.map(p => {
    const base = p.lang === "zh" ? q.zh : q.en;
    return { query: p.sites.length ? `${base} (${p.sites.map(d => `site:${d}`).join(" OR ")})` : base, lang: p.lang };
  });
  const lists = await Promise.all(queries.map(x => search(x.query, x.lang).catch(() => [])));
  const pool: Row[] = [];
  for (const r of lists.flat()) {
    if (pool.some(p => p.url === r.url) || !looksLikeInterview(r.title, r.snippet)) continue;
    pool.push({ ...r, id: `c${pool.length + 1}` });
  }
  if (!pool.length) return [];

  const { data } = await callAIJson<{ items: (Judgement & { date: string | null })[] }>({
    schemaName: "interview_judgement", timeoutMs: 45000, maxTokens: 3000,
    schema: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "isInterview", "sameCompany", "roleMatch", "date"], properties: {
      id: { type: "string" }, isInterview: { type: "boolean" }, sameCompany: { type: "boolean" },
      roleMatch: { type: "string", enum: ["same", "close", "different"] }, date: { type: ["string", "null"] } } } } } },
    messages: [
      { role: "system", content: `你在为求职者筛选面经链接。目标岗位：「${company}·${title}」。对每条搜索结果判断：isInterview=是否为真实的面试经验/面试题/面试流程分享（招聘广告、职位列表、培训课程、泛泛求职建议均为false）；sameCompany=是否明确是该公司的面试；roleMatch=岗位方向与目标是否相同(same)、相近(close，如同职能不同细分)、明显不同(different，例如目标是软件产品经理而结果是硬件产品经理，或职能完全不同)；date=能从标题或摘要看出的发布日期(YYYY-MM-DD 或 YYYY-MM)，看不出填null。只依据给出的文字判断，不确定时从严。` },
      { role: "user", content: pool.map(r => `${r.id} | ${r.platform} | ${r.title} | ${r.snippet}`).join("\n") },
    ],
  });
  const withDates = pool.map(r => {
    const d = data.items.find(i => i.id === r.id)?.date;
    return !r.publishedAt && d && !isNaN(Date.parse(d)) ? { ...r, publishedAt: d.slice(0, 10) } : r;
  });
  return rankLinks(withDates, data.items).map(({ id: _id, ...r }) => r);
}

async function summarize(title: string, company: string, links: { url: string; title: string }[]) {
  const pages = await Promise.all(links.slice(0, 5).map(async (l) => {
    try {
      const res = await fetch(`${GATEWAY}/scrape`, { method: "POST", headers: keys(), body: JSON.stringify({ url: l.url, formats: ["markdown"], onlyMainContent: true, timeout: 20000 }) });
      if (!res.ok) return null;
      const raw = await res.json();
      const md = String(raw.markdown || raw.data?.markdown || "").slice(0, 4000);
      return md.length > 200 ? `【${l.title}】\n${md}` : null;
    } catch { return null; }
  }));
  const text = pages.filter(Boolean).join("\n\n---\n\n");
  if (!text) throw new AIError(502, "面经原文暂时无法读取，请直接打开链接查看");
  const out = await callAIText({ timeoutMs: 45000, maxTokens: 1200, messages: [
    { role: "system", content: `把下面几篇关于「${company}·${title}」的面经原文提炼成简洁中文要点，分三段：面试流程、高频问题（最多6条）、准备建议（最多3条）。只写原文中出现过的内容，不编造；每段用「· 」开头的短句列点，不用 markdown 标题符号。` },
    { role: "user", content: text },
  ] });
  return out.text.trim().slice(0, 3000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "请先登录后再搜索面经" }, 401);
    const body = await req.json().catch(() => null);
    const appKey = s(body?.appKey, 200), title = s(body?.title, 80), company = s(body?.company, 60);
    const action = body?.action === "summarize" ? "summarize" : "search";
    if (!appKey || !title) return json({ error: "岗位信息不完整" }, 400);
    const db = adminClient();

    if (action === "summarize") {
      const { data: row } = await db.from("interview_searches").select("*").eq("user_id", user.id).eq("app_key", appKey).maybeSingle();
      if (!row || !(row.results as unknown[]).length) return json({ error: "还没有可总结的面经" }, 400);
      const summary = await summarize(row.title, row.company || "", row.results as { url: string; title: string }[]);
      const { data } = await db.from("interview_searches").update({ summary }).eq("id", row.id).select().single();
      return json({ record: data });
    }

    const results = await runSearch(title, company);
    const { data, error } = await db.from("interview_searches").upsert(
      { user_id: user.id, app_key: appKey, title, company, results, summary: null, searched_at: new Date().toISOString() },
      { onConflict: "user_id,app_key" }).select().single();
    if (error) throw error;
    return json({ record: data, platforms: platformLinks(title, company) });
  } catch (e) {
    if (e instanceof Response) return new Response(await e.text(), { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (e instanceof AIError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "搜索失败" }, 500);
  }
});
