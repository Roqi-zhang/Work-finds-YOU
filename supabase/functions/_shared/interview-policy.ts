/** Interview-experience search: platform list, query safety and ranking. Pure — testable from vitest. */

export const INTERVIEW_PLATFORMS = [
  { platform: "小红书", sites: ["xiaohongshu.com"], lang: "zh", search: "https://www.xiaohongshu.com/search_result?keyword=" },
  { platform: "牛客网", sites: ["nowcoder.com"], lang: "zh", search: "https://www.nowcoder.com/search/all?query=" },
  { platform: "知乎", sites: ["zhihu.com"], lang: "zh", search: "https://www.zhihu.com/search?type=content&q=" },
  { platform: "BOSS直聘 / 智联 / 前程无忧", sites: ["zhipin.com", "zhaopin.com", "51job.com"], lang: "zh", search: "https://www.zhipin.com/web/geek/job?query=" },
  { platform: "猎聘 / 拉勾", sites: ["liepin.com", "lagou.com"], lang: "zh", search: "https://www.liepin.com/zhaopin/?key=" },
  { platform: "看准网 / 脉脉", sites: ["kanzhun.com", "maimai.cn"], lang: "zh", search: "https://www.kanzhun.com/search?query=" },
  { platform: "应届生 / 一亩三分地", sites: ["yingjiesheng.com", "1point3acres.com"], lang: "zh", search: "https://www.1point3acres.com/bbs/search.php?q=" },
  { platform: "百度", sites: [], lang: "zh", search: "https://www.baidu.com/s?wd=" },
  { platform: "Glassdoor / Reddit / LinkedIn", sites: ["glassdoor.com", "reddit.com", "linkedin.com"], lang: "en", search: "https://www.glassdoor.com/Search/results.htm?keyword=" },
  { platform: "Google", sites: [], lang: "en", search: "https://www.google.com/search?q=" },
] as const;

export const MAX_LINKS = 10;

const safe = (v: string, max = 60) =>
  v.replace(/https?:\/\/\S+|\S+@\S+|\+?\d[\d\s-]{6,}\d/g, "").replace(/["\n\r()]/g, " ").replace(/\s+/g, " ").slice(0, max).trim();

/** Only company + job title ever leave the app. */
export function interviewQueries(title: string, company: string) {
  const t = safe(title), c = company && company !== "—" && company !== "待确认" ? safe(company, 40) : "";
  return { zh: `${c} ${t} 面经`.trim(), en: `${c} ${t} interview`.trim(), plain: `${c} ${t} 面经`.trim() };
}

export function platformLinks(title: string, company: string) {
  const q = interviewQueries(title, company);
  return INTERVIEW_PLATFORMS.map(p => ({ platform: p.platform.split(" / ")[0], url: p.search + encodeURIComponent(p.lang === "zh" ? q.zh : q.en) }));
}

const INTERVIEW_HINT = /面经|面试|笔试|一面|二面|三面|终面|hr面|群面|offer|interview|面筋/i;
export function looksLikeInterview(title: string, snippet: string) {
  return INTERVIEW_HINT.test(title) || INTERVIEW_HINT.test(snippet.slice(0, 400));
}

export type Candidate = { id: string; title: string; url: string; platform: string; publishedAt: string | null };
export type Judgement = { id: string; isInterview: boolean; sameCompany: boolean; roleMatch: "same" | "close" | "different" };
export type InterviewLink = Candidate & { sameCompany: boolean; roleMatch: "same" | "close" };

/** Company match first, then role direction, then newest; anything over two years old sinks. Max 10. */
export function rankLinks(cands: Candidate[], judged: Judgement[], now = new Date()): InterviewLink[] {
  const byId = new Map(judged.map(j => [j.id, j]));
  const twoYears = now.getTime() - 730 * 86400000;
  const rows: InterviewLink[] = [];
  const seen = new Set<string>();
  for (const c of cands) {
    const j = byId.get(c.id);
    if (!j || !j.isInterview || j.roleMatch === "different" || seen.has(c.url)) continue;
    seen.add(c.url);
    rows.push({ ...c, sameCompany: !!j.sameCompany, roleMatch: j.roleMatch });
  }
  const time = (d: string | null) => { const t = d ? Date.parse(d) : NaN; return isNaN(t) ? 0 : t; };
  const tier = (r: InterviewLink) => {
    const old = time(r.publishedAt) && time(r.publishedAt) < twoYears ? 4 : 0;
    return old + (r.sameCompany ? 0 : 2) + (r.roleMatch === "same" ? 0 : 1);
  };
  return rows.sort((a, b) => tier(a) - tier(b) || time(b.publishedAt) - time(a.publishedAt)).slice(0, MAX_LINKS);
}
