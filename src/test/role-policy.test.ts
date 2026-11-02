import { describe, expect, it } from "vitest";
import { enrichRubric, researchQuery, validateEntries, usefulSources, valuableEntries, publicUrl, type KnowledgeEntry, type KnowledgeSource } from "../../supabase/functions/_shared/role-policy";
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
describe("value-first research selection", () => {
  const text = "具体介绍产品设计师如何使用真实用户任务验证交互原型并记录失败原因。";
  const s = { ...source("interview_reference"), excerpt: text };
  const assessment = { sourceId: "s1", relevant: true, credible: true, addsValue: true, reason: "补充原型验证的具体方法", quote: text };
  it("不相关的资料不展示", () => { expect(usefulSources([s], [{ ...assessment, relevant: false }])).toEqual([]); });
  it("不可信资料不展示", () => { expect(usefulSources([s], [{ ...assessment, credible: false }])).toEqual([]); });
  it("无增量价值的资料不展示", () => { expect(usefulSources([s], [{ ...assessment, addsValue: false }])).toEqual([]); });
  it("保留具有原文支持的有用面经", () => { expect(usefulSources([s], [assessment])).toEqual([s]); });
  it("编造的原文摘录不被接受", () => { expect(usefulSources([s], [{ ...assessment, quote: "这段并不存在的原文声称公司面试要求所有候选人熟悉全栈开发。" }])).toEqual([]); });
  it("未评估的来源默认舍弃", () => { expect(usefulSources([s], [])).toEqual([]); });
  it("无有用资料可返回空结论而非强行补全", () => { expect(valuableEntries([], [], [{ id: "r1" }])).toEqual([]); });
  it("无法说明新增价值的条目舍弃", () => { expect(valuableEntries([{ ...entry, addedValue: "" }], [s], [{ id: "r1" }])).toEqual([]); });
  it("混用已拒绝来源的条目舍弃", () => { expect(valuableEntries([{ ...entry, addedValue: "原型验证方法", sourceIds: ["s1", "rejected"] }], [s], [{ id: "r1" }])).toEqual([]); });
  it("重复结论只保留一次", () => { const useful = { ...entry, addedValue: "原型验证方法" }; expect(valuableEntries([useful, useful], [s], [{ id: "r1" }])).toHaveLength(1); });
});
describe("multi-platform research queries", () => {
  it("never sends contact details or URLs from title/company", async () => {
    const { researchQueries } = await import("../../supabase/functions/_shared/role-policy");
    const q = researchQueries("产品设计师 a@b.com https://x.cn/jd", "某公司 13800138000", "ui-design");
    for (const v of [q.zh, q.en]) { expect(v).not.toMatch(/@|https?:|13800138000/); }
    expect(q.zh).toContain("面经");
  });
});
