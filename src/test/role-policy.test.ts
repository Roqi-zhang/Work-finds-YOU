import { describe, expect, it } from "vitest";
import { enrichRubric, researchQuery, validateEntries, publicUrl, type KnowledgeEntry, type KnowledgeSource } from "../../supabase/functions/_shared/role-policy";
const source = (tier: KnowledgeSource["tier"]): KnowledgeSource => ({ id: "s1", tier, title: "标准", publisher: "发布方", url: "https://example.org/role", publishedAt: null, retrievedAt: "2026-11-02", contentHash: "hash", excerpt: "正文", locator: "章节" });
const entry: KnowledgeEntry = { dimensionKey: "skill", title: "迭代", explanation: "效果验证", behaviors: ["验证效果"], validEvidence: ["指标"], sourceIds: ["s1"], requirementIds: ["r1"], strong: "独立验证", medium: "参与验证", weak: "零星迹象", basis: "jd_supported_enrichment" };
const base = { version: "v1", benchmark_ref: null as string | null, dimensions: { skill: { definition: "产品迭代", subdimensions: [], anchors: { strong: "原强", medium: "原中", weak: "原弱" }, validEvidence: [], invalidInferences: [] } } };
describe("JD-first role knowledge rules", () => {
  it("面经不能成为正式评级依据", () => { const validated = validateEntries([entry], [source("interview_reference")], [{ id: "r1" }]); expect(validated[0].basis).toBe("interview_reference"); expect(enrichRubric(base, validated, [{ dimensionKey: "skill", requirementIds: ["r1"] }], "v2")).toEqual(base); });
  it("JD未支持的通用能力不改变评价标准", () => { const validated = validateEntries([{ ...entry, requirementIds: ["unknown"] }], [source("occupational_standard")], [{ id: "r1" }]); expect(validated[0].basis).toBe("general_reference"); expect(enrichRubric(base, validated, [], "v2")).toEqual(base); });
  it("补全仅解释已有JD职责并保留历史标准", () => { const result = enrichRubric(base, [entry], [{ dimensionKey: "skill", requirementIds: ["r1"] }], "snapshot-v2"); expect(result.dimensions.skill.anchors.strong).toBe("独立验证"); expect(result.benchmark_ref).toBe("snapshot-v2"); expect(base.dimensions.skill.anchors.strong).toBe("原强"); });
  it("虚构引用被丢弃", () => { expect(validateEntries([{ ...entry, sourceIds: ["fake"] }], [source("occupational_standard")], [{ id: "r1" }])).toEqual([]); });
  it("混入面经的能力不进入正式评级", () => { expect(validateEntries([{ ...entry, sourceIds: ["s1", "s2"] }], [source("occupational_standard"), { ...source("interview_reference"), id: "s2" }], [{ id: "r1" }])[0].basis).toBe("interview_reference"); });
  it("搜索不发送联系方式", () => { expect(researchQuery("产品经理 test@example.org", "13800138000", "product")).not.toMatch(/test@example|13800138000/); });
  it("外部来源不能访问本地地址", () => { expect(publicUrl("http://127.0.0.1/a")).toBeNull(); expect(publicUrl("javascript:alert(1)")).toBeNull(); });
});
describe("multi-platform research queries", () => {
  it("never sends contact details or URLs from title/company", async () => {
    const { researchQueries } = await import("../../supabase/functions/_shared/role-policy");
    const q = researchQueries("产品设计师 a@b.com https://x.cn/jd", "某公司 13800138000", "ui-design");
    for (const v of [q.zh, q.en]) { expect(v).not.toMatch(/@|https?:|13800138000/); }
    expect(q.zh).toContain("面经");
  });
});
