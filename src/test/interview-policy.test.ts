import { describe, expect, it } from "vitest";
import { interviewQueries, rankLinks, type Candidate, type Judgement } from "../../supabase/functions/_shared/interview-policy";

const now = new Date("2026-11-02");
const c = (id: string, publishedAt: string | null): Candidate => ({ id, title: id, url: "https://x.com/" + id, platform: "小红书", publishedAt });
const j = (id: string, sameCompany: boolean, roleMatch: Judgement["roleMatch"], isInterview = true): Judgement => ({ id, isInterview, sameCompany, roleMatch });

describe("interview link ranking", () => {
  it("puts same company before other companies even when older", () => {
    const out = rankLinks([c("other", "2026-10-01"), c("same", "2026-03-01")], [j("other", false, "same"), j("same", true, "same")], now);
    expect(out.map(r => r.id)).toEqual(["same", "other"]);
  });
  it("puts same role direction before close direction within the same company", () => {
    const out = rankLinks([c("close", "2026-10-01"), c("exact", "2026-01-01")], [j("close", true, "close"), j("exact", true, "same")], now);
    expect(out.map(r => r.id)).toEqual(["exact", "close"]);
  });
  it("orders newest first within the same tier", () => {
    const out = rankLinks([c("a", "2025-05-01"), c("b", "2026-10-01")], [j("a", true, "same"), j("b", true, "same")], now);
    expect(out.map(r => r.id)).toEqual(["b", "a"]);
  });
  it("drops different role directions such as hardware PM for a software PM", () => {
    const out = rankLinks([c("hw", "2026-10-01")], [j("hw", true, "different")], now);
    expect(out).toEqual([]);
  });
  it("drops non-interview posts", () => {
    expect(rankLinks([c("ad", "2026-10-01")], [j("ad", true, "same", false)], now)).toEqual([]);
  });
  it("returns at most 10 links in total", () => {
    const cands = Array.from({ length: 15 }, (_, i) => c("p" + i, "2026-10-01"));
    expect(rankLinks(cands, cands.map(x => j(x.id, true, "same")), now)).toHaveLength(10);
  });
  it("never sends links, emails or phone numbers to search", () => {
    const q = interviewQueries("产品经理 https://evil.com a@b.com 13800138000", "腾讯");
    expect(q.zh).not.toMatch(/http|@|13800138000/);
  });
});
