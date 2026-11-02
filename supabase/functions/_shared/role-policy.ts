export type KnowledgeSource = {
  id: string; tier: "occupational_standard" | "company_official" | "interview_reference";
  title: string; publisher: string; url: string; publishedAt: string | null;
  retrievedAt: string; contentHash: string; excerpt: string; locator: string; platform?: string;
};
export type KnowledgeEntry = {
  dimensionKey: string; title: string; explanation: string; behaviors: string[];
  validEvidence: string[]; sourceIds: string[]; requirementIds: string[];
  strong: string; medium: string; weak: string;
  basis: "jd_supported_enrichment" | "general_reference" | "interview_reference";
};
export const ROLE_KNOWLEDGE_VERSION = "role-knowledge-v5";
export type SourceAssessment = {
  sourceId: string; relevant: boolean; credible: boolean; addsValue: boolean;
  reason: string; quote: string;
};

/** A model assessment is required, with a traceable passage, before using a source. */
export function usefulSources(sources: KnowledgeSource[], assessments: SourceAssessment[]): KnowledgeSource[] {
  const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();
  return sources.filter(source => assessments.some(a => a.sourceId === source.id &&
    a.relevant && a.credible && a.addsValue && a.reason.trim().length > 0 &&
    normalize(a.quote).length >= 20 && normalize(source.excerpt).includes(normalize(a.quote))));
}

export type EntryValue = { sourceIds: string[]; addedValue: string };
export function valuableEntries<T extends KnowledgeEntry & EntryValue>(entries: T[], sources: KnowledgeSource[], requirements: { id: string }[]): KnowledgeEntry[] {
  const ids = new Set(sources.map(s => s.id));
  const seen = new Set<string>();
  return validateEntries(entries.filter(e => {
    const key = e.explanation.replace(/\s+/g, "");
    if (!e.addedValue.trim() || !key || seen.has(key) || !e.sourceIds.length || e.sourceIds.some(id => !ids.has(id))) return false;
    seen.add(key);
    return true;
  }), sources, requirements);
}
export const ROLE_KEYS = ["skill", "business", "analysis", "delivery", "comm", "collab", "learning", "motive"];

export function publicUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) return null;
    if (!u.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) || u.hostname.includes(":")) return null;
    u.hash = "";
    return u.href;
  } catch { return null; }
}

export function roleFamily(title: string): string | null {
  if (/AI.*产品|产品.*AI|人工智能.*产品/i.test(title)) return "ai-product";
  if (/产品经理|product manager|product owner/i.test(title)) return "product";
  if (/UX|交互|用户体验|user experience/i.test(title)) return "ux-design";
  if (/UI|界面|产品设计|product design|interface design/i.test(title)) return "ui-design";
  return null;
}

/** Chinese and English keyword pairs, built only from public title/company/family. */
export function researchQueries(title: string, company: string, family: string | null): { zh: string; en: string } {
  const safe = (v: string) => v.replace(/https?:\/\/\S+|\S+@\S+|\+?\d[\d\s-]{6,}\d/g, "").replace(/["\n\r()]/g, " ").slice(0, 60).trim();
  const c = company === "待确认" ? "" : safe(company);
  const design = family?.includes("design");
  return { zh: `${safe(title)} ${c} ${design ? "面经 作品集 能力要求" : "面经 能力要求"}`.trim(), en: `${safe(title)} ${c} ${design ? "interview portfolio skills" : "interview competencies skills"}`.trim() };
}

/** Never export raw JD, requirements or candidate data to search services. */
export function researchQuery(title: string, company: string, family: string | null): string {
  const safe = (v: string) => v.replace(/https?:\/\/\S+|\S+@\S+|\+?\d[\d\s-]{6,}\d/g, "").replace(/["\n\r]/g, " ").slice(0, 80);
  return `${safe(title)} ${company === "待确认" ? "" : safe(company)} ${family?.includes("design") ? "design usability accessibility competencies" : "岗位职责 能力要求 官方"}`.trim();
}

/** Unsupported references are discarded, not silently promoted into JD evidence. */
export function validateEntries(entries: KnowledgeEntry[], sources: KnowledgeSource[], requirements: { id: string }[]): KnowledgeEntry[] {
  const ids = new Set(requirements.map(r => r.id));
  const bySource = new Map(sources.map(s => [s.id, s]));
  return entries.filter(e => ROLE_KEYS.includes(e.dimensionKey)).flatMap(e => {
    const sourceIds = [...new Set(e.sourceIds)].filter(id => bySource.has(id));
    if (!sourceIds.length) return [];
    const requirementIds = [...new Set(e.requirementIds)].filter(id => ids.has(id));
    const interviewOnly = sourceIds.some(id => bySource.get(id)?.tier === "interview_reference");
    return [{ ...e, sourceIds, requirementIds: interviewOnly ? [] : requirementIds,
      basis: interviewOnly ? "interview_reference" : requirementIds.length ? "jd_supported_enrichment" : "general_reference" } as KnowledgeEntry];
  }).slice(0, 16);
}

/** Changes explanations/anchors only where the JD already requires a dimension. */
export function enrichRubric<T extends { version: string; benchmark_ref: string | null; dimensions: Record<string, { definition: string; subdimensions: string[]; anchors: { strong: string; medium: string; weak: string }; validEvidence: string[]; invalidInferences: string[] }> }>(base: T, entries: KnowledgeEntry[], signals: { dimensionKey: string; requirementIds: string[] }[], version: string): T {
  const next = structuredClone(base);
  let changed = false;
  for (const e of entries) {
    if (e.basis !== "jd_supported_enrichment" || !signals.some(s => s.dimensionKey === e.dimensionKey && s.requirementIds.some(id => e.requirementIds.includes(id)))) continue;
    const dim = next.dimensions[e.dimensionKey];
    if (!dim) continue;
    dim.definition = `${dim.definition}\n职责补全：${e.explanation}`;
    dim.subdimensions = [...new Set([...dim.subdimensions, e.title])];
    dim.validEvidence = [...new Set([...dim.validEvidence, ...e.validEvidence])];
    dim.invalidInferences = [...new Set([...dim.invalidInferences, "不得把通用能力或面经视为招聘硬门槛；简历未体现不等于不会。"] )];
    if (e.strong && e.medium && e.weak) dim.anchors = { strong: e.strong, medium: e.medium, weak: e.weak };
    changed = true;
  }
  if (changed) { next.version = `${base.version}+${ROLE_KNOWLEDGE_VERSION}`; next.benchmark_ref = version; }
  return next;
}