import { describe, expect, it } from "vitest";
import { freshSources, matchReferenceBlock, type KnowledgeSource } from "../../supabase/functions/_shared/role-policy";
const src = (id: string, tier: KnowledgeSource["tier"], publishedAt: string | null): KnowledgeSource => ({ id, tier, title: id, publisher: "p", platform: "牛客网", url: `https://example.org/${id}`, publishedAt, retrievedAt: "2026-11-19", contentHash: id, excerpt: "x", locator: "" });
const now = new Date("2026-11-19");
describe("三层岗位资料", () => {
  it("超过24个月的面经被丢弃", () => { expect(freshSources([src("old", "interview_reference", "2024-10-01")], now)).toEqual([]); });
  it("近两年内的面经保留", () => { expect(freshSources([src("new", "interview_reference", "2025-06-01")], now)).toHaveLength(1); });
  it("职业库资料不受时间限制", () => { expect(freshSources([src("esco", "occupational_standard", "2019-01-01")], now)).toHaveLength(1); });
  it("没有补充条目时匹配不带参考资料", () => { expect(matchReferenceBlock({ entries: [], sources: [] })).toBe(""); });
  it("匹配参考标明面经且声明不影响判定", () => {
    const block = matchReferenceBlock({ entries: [{ dimensionKey: "analysis", title: "t", explanation: "近期面经提到现场拆解留存问题", behaviors: [], validEvidence: [], sourceIds: ["i1"], requirementIds: [], strong: "", medium: "", weak: "", basis: "interview_reference" }], sources: [src("i1", "interview_reference", "2026-08-01")] });
    expect(block).toContain("面经"); expect(block).toContain("不得影响任何 gapType");
  });
});
