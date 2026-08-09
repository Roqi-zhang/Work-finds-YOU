/* =============================================================
   WFY data layer (TS port of public/previews/_data.js)
   The ONLY place that touches storage. Swap the bodies of the
   getters and setters for fetch calls when the API lands.
   ============================================================= */

export type Job = {
  id: string;
  title: string;
  co: string;
  loc: string;
  m: number;
  s: string;
  yes: string;
  no: string;
};

export type AppEvent = { status: string; at: string };

export type Application = {
  id: string;
  co: string;
  title: string;
  m: number;
  status: string;
  appliedAt: string;
  updatedAt: string;
  body: string;
  quote: string;
  events: AppEvent[];
  manual?: boolean;
};


export const KEYS = {
  pool: "wfy.pool",
  apps: "wfy.applications",
  reports: "wfy.matchReports",
  jobs: "wfy.jobs",
  ui: "wfy.ui",
  migrated: "wfy.migrated.v1",
};

function read<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/* ---------- ids ---------- */
export function slugId(co: string, title: string) {
  return String(co + "-" + title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ---------- job catalog ---------- */
const SEED_JOBS: Job[] = (
  [
    { title: "Senior Frontend", co: "Stripe", loc: "Remote / SF", m: 78, s: "$180K–220K", yes: "Craft · Product", no: "Team > 60" },
    { title: "Design Engineer", co: "Linear", loc: "Remote", m: 84, s: "$170K–210K", yes: "Craft · Speed", no: "Small team OK" },
    { title: "Web Platform", co: "Vercel", loc: "Hybrid NYC", m: 72, s: "$160K–200K", yes: "Perf", no: "Hybrid required" },
    { title: "Staff FE", co: "Notion", loc: "Remote", m: 68, s: "$210K–260K", yes: "Editor systems", no: "Long tenure need" },
    { title: "Frontend Lead", co: "Figma", loc: "SF", m: 88, s: "$220K–270K", yes: "Design tools", no: "Onsite" },
    { title: "UI Systems", co: "Retool", loc: "Remote", m: 66, s: "$150K–190K", yes: "Design system", no: "B2B focus" },
    { title: "Product Eng", co: "Raycast", loc: "Remote EU", m: 81, s: "€120K–160K", yes: "Product craft", no: "Time zone" },
    { title: "FE / DX", co: "Warp", loc: "SF", m: 63, s: "$170K–210K", yes: "DX focus", no: "Onsite" },
    { title: "Frontend Arch", co: "Databricks", loc: "Remote", m: 59, s: "$230K–290K", yes: "Data UI", no: "Enterprise" },
    { title: "Web Eng", co: "OpenAI", loc: "SF", m: 91, s: "$220K–260K", yes: "Cutting edge", no: "Onsite" },
    { title: "UI Engineer", co: "Anthropic", loc: "Remote", m: 76, s: "$210K–250K", yes: "Research UI", no: "Sec review" },
    { title: "Senior Web", co: "Cloudflare", loc: "Remote", m: 64, s: "$180K–220K", yes: "Edge platform", no: "Legacy code" },
  ] as Omit<Job, "id">[]
).map((j) => ({ ...j, id: slugId(j.co, j.title) }));

const SEED_MAP: Record<string, Job> = {};
SEED_JOBS.forEach((j) => {
  SEED_MAP[j.id] = j;
});

export function allJobs(): Job[] {
  const extra = read<Record<string, Job>>(KEYS.jobs, {});
  const out = SEED_JOBS.slice();
  Object.keys(extra).forEach((id) => {
    if (!SEED_MAP[id]) out.push(extra[id]);
  });
  return out;
}
export function getJob(id?: string | null): Job | null {
  if (!id) return null;
  return SEED_MAP[id] || read<Record<string, Job>>(KEYS.jobs, {})[id] || null;
}
export function putJob(job: Job): Job | null {
  if (!job) return null;
  job.id = job.id || slugId(job.co, job.title);
  if (!SEED_MAP[job.id]) {
    const extra = read<Record<string, Job>>(KEYS.jobs, {});
    extra[job.id] = job;
    write(KEYS.jobs, extra);
  }
  return job;
}

/* ---------- compare pool ---------- */
export function getPoolIds(): string[] {
  let v = read<string[] | null>(KEYS.pool, null);
  if (!Array.isArray(v)) {
    v = SEED_JOBS.map((j) => j.id);
    write(KEYS.pool, v);
  }
  return v.filter((id) => !!getJob(id));
}
export function getPool(): Job[] {
  return getPoolIds()
    .map(getJob)
    .filter(Boolean) as Job[];
}
export function addToPool(job: Job) {
  putJob(job);
  const ids = getPoolIds();
  if (ids.indexOf(job.id) < 0) {
    ids.push(job.id);
    write(KEYS.pool, ids);
  }
  return job.id;
}
export function removeFromPool(id: string) {
  write(
    KEYS.pool,
    getPoolIds().filter((x) => x !== id)
  );
}

/* ---------- applications ---------- */
export const STATUSES = ["待投递", "已投递", "面试中", "结束"];

const SEED_APPS = [
  {
    id: slugId("Stripe", "Senior Frontend"),
    status: "已投递",
    at: "2026-07-12",
    body: "今天把改过的自我介绍投出去了。CI/CD 那段补上后整体读起来更完整，团队规模的偏好我先没说，等到面试再谈。",
    quote: "我更在意工艺被认真对待——比起团队大小，这才是我最想问的问题。",
  },
  {
    id: slugId("Linear", "Design Engineer"),
    status: "面试中",
    at: "2026-07-10",
    body: "HR 回信说下周约一次 45 分钟的技术对话。对方直接问了我关于「输入延迟感」的看法，说明他们真的在意 craft，这是我今年遇到最有共鸣的团队之一。",
    quote: "",
  },
  {
    id: slugId("Raycast", "Product Eng"),
    status: "面试中",
    at: "2026-07-07",
    body: "技术二面聊得不错，最后 20 分钟主要在讨论时区。他们希望有 4 小时和欧洲重叠，我现在能做到的是 2 小时；这是个真正需要谈的分歧。",
    quote: "",
  },
  {
    id: slugId("Vercel", "Web Platform"),
    status: "结束",
    at: "2026-07-02",
    body: "拒信里提到「我们希望候选人能全职在纽约」。这是画像上明确写着的 Remote 偏好被现实撞了一下。加入知识库，作为对下一次决策的参考。",
    quote: "",
  },
  {
    id: slugId("Figma", "Frontend Lead"),
    status: "结束",
    at: "2026-06-28",
    body: "三周前的记录：Onsite 谈成 3 天到岗。签下的那一刻我意识到——如果没有对比页把它和 Stripe 并排看一眼，我可能会更犹豫。",
    quote: "",
  },
];

type RawApp = Partial<Application> & { id: string; at?: string };

function normalizeApp(a: RawApp): Application {
  const job = getJob(a.id) || ({} as Job);
  const at = a.appliedAt || a.at || new Date().toISOString().slice(0, 10);
  return {
    id: a.id,
    co: a.co || job.co || "—",
    title: a.title || job.title || "—",
    m: typeof a.m === "number" ? a.m : job.m || 0,
    status: STATUSES.indexOf(a.status || "") > -1 ? (a.status as string) : "待投递",
    appliedAt: at,
    updatedAt: a.updatedAt || at,
    body: a.body || "",
    quote: a.quote || "",
    manual: !!a.manual,
    events: Array.isArray(a.events) && a.events.length
      ? a.events
      : [{ status: a.status || "待投递", at: a.updatedAt || at }],
  };
}


export function getApplications(): Application[] {
  let v = read<RawApp[] | null>(KEYS.apps, null);
  if (!Array.isArray(v)) {
    v = SEED_APPS.slice();
    write(KEYS.apps, v.map(normalizeApp));
  }
  return v
    .map(normalizeApp)
    .sort((a, b) => (b.appliedAt || "").localeCompare(a.appliedAt || ""));
}
export function saveApplications(list: Application[]) {
  write(KEYS.apps, list.map(normalizeApp));
}

export function applyToJob(job: Job) {
  putJob(job);
  const list = getApplications();
  if (list.some((a) => a.id === job.id)) return job.id;
  const today = new Date().toISOString().slice(0, 10);
  list.unshift(
    normalizeApp({
      id: job.id,
      co: job.co,
      title: job.title,
      m: job.m,
      status: "待投递",
      appliedAt: today,
      updatedAt: today,
      body: "匹配 " + job.m + "%，投前 3 步的建议尚未全部完成，先记录下来。",
      quote: "",
    })
  );
  saveApplications(list);
  return job.id;
}

export function setStatus(id: string, status: string) {
  const today = new Date().toISOString().slice(0, 10);
  const list = getApplications().map((a) => {
    if (a.id !== id) return a;
    a.status = status;
    a.updatedAt = today;
    a.events = a.events.concat([{ status, at: today }]);
    return a;
  });
  saveApplications(list);
}

export function createApplication(input: {
  co: string;
  title: string;
  status?: string;
  appliedAt?: string;
  body?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const at = input.appliedAt || today;
  const id = "manual-" + Date.now().toString(36);
  const list = getApplications();
  list.unshift(
    normalizeApp({
      id,
      co: input.co,
      title: input.title,
      m: 0,
      status: input.status || "待投递",
      appliedAt: at,
      updatedAt: at,
      body: input.body || "",
      quote: "",
      manual: true,
      events: [{ status: input.status || "待投递", at }],
    })
  );
  saveApplications(list);
  return id;
}

export function updateApplication(id: string, patch: Partial<Application>) {
  const list = getApplications().map((a) => (a.id === id ? Object.assign(a, patch) : a));
  saveApplications(list);
}


/* ---------- match reports ---------- */
export function reportTemplate(job: Job) {
  const m = job.m;
  const flag = m >= 85 ? "优先投" : m >= 70 ? "改完再投" : "可投不优先";
  const win = m >= 85 ? "高" : m >= 75 ? "中高" : m >= 65 ? "中" : "低";
  const rank = m >= 85 ? "Top 1" : m >= 75 ? "Top 3" : "备选";
  const risk = Math.max(10, 100 - m - 20);
export type StepKind = "resume" | "interview" | "portfolio";
export type StepItem = { point: string; suggestion: string; evidence: string };

  const dims = (

    [
      ["专业技能", Math.min(99, m + 16)],
      ["系统设计", Math.min(99, m + 10)],
      ["执行交付", Math.min(99, m + 7)],
      ["产品理解", Math.min(99, m + 4)],
      ["协作沟通", m],
      ["学习成长", Math.max(20, m - 2)],
      ["工程素养", Math.max(20, m - 24)],
      ["动机稳定性", Math.max(20, m - 30)],
    ] as [string, number][]
  ).map((d) => ({ name: d[0], score: d[1] }));

  return {
    jobId: job.id,
    job,
    score: m,
    riskScore: risk,
    overview:
      "基于你的花瓣画像与该岗位的 24 个维度做对齐。整体处于「" +
      flag +
      "」区间，主要匹配点集中在系统设计与前端工艺，主要风险集中在团队规模与工程链路要求。",
    decision: {
      flag,
      score: m,
      win,
      rank,
      evidence: {
        "d.verdict": {
          判定依据:
            "8 个维度中 " +
            dims.filter((d) => d.score >= 70).length +
            " 个达标，唯一硬缺口「工程素养 " +
            dims[6].score +
            "」属于表达缺失而非能力缺失。",
          引用来源: "JD 第 4 条 · 简历第 2 段 · 画像 v3 维度分",
          置信度: "中高",
        },
        "d.priorityFlag": {
          判定依据: "硬性要求命中率 6/8，缺口可在 3 小时内补齐，立即投会浪费一次机会。",
          引用来源: "JD 第 4 条「owns deployment pipeline」",
          置信度: "高",
        },
        "d.score": {
          判定依据: "8 维加权平均：技能类权重 0.5，工程与动机类权重 0.3。",
          引用来源: "分项评分表（见 04）",
          置信度: "高",
        },
        "d.winLevel": {
          判定依据:
            "匹配分处于 " +
            Math.floor(m / 10) * 10 +
            "–" +
            (Math.floor(m / 10) * 10 + 10) +
            " 区间，且存在 1 个明确扣分项与 1 个面试风险点。",
          引用来源: "同类岗位对照 · 4 个同级 JD 的要求交集",
          置信度: "中",
        },
        "d.rank": {
          判定依据: "在当前对比池中综合排名靠前，薪资与技术栈契合度好，仅工程链路要求偏高。",
          引用来源: "对比池快照",
          置信度: "中",
        },
      } as Record<string, Record<string, string>>,
    },
    judgements: [
      {
        kind: "最大优势",
        mark: "",
        title: "复杂前端系统的独立交付能力",
        desc: "主导过 3 个百万级 DAU 前端重构，与该岗位「负责" + job.title + "架构」的核心诉求直接对齐。",
        tags: ["专业技能", "执行交付"],
        srcId: "j.strength",
        evidence: {
          岗位要求: "JD 第 1 条：「Own the architecture of our front-end」。",
          简历证据: "简历第 1 段：「主导交易前端重构，拆分 12 个模块，日活 320 万」。",
        } as Record<string, string>,
      },
      {
        kind: "最大缺口",
        mark: "w",
        title: "缺少可验证的 CI/CD 与线上排障证据",
        desc: "JD 明确要求参与部署链路与值班，简历中无相关描述，画像该维度 " + dims[6].score + " 分。",
        tags: ["工程素养"],
        srcId: "j.gap",
        evidence: {
          岗位要求: "JD 第 4 条：「owns deployment pipeline & participates in on-call」。",
          简历证据: "简历第 2 段仅有「负责发布流程优化」，无工具、无指标、无值班记录。",
        } as Record<string, string>,
      },
      {
        kind: "最大风险",
        mark: "i",
        title: "团队规模偏好与岗位环境不一致",
        desc: "该团队 60+ 人、跨时区协作，你的画像偏好 ≤ 20 人小团队，面试中大概率被追问。",
        tags: ["协作沟通", "动机稳定性"],
        srcId: "j.risk",
        evidence: {
          岗位要求: "公司公开信息：团队 60+ 人，横跨 3 个时区，异步协作为主。",
          简历证据: "画像动机维度：近 3 段经历团队规模 8 / 15 / 18 人，平均在职 14 个月。",
        } as Record<string, string>,
      },
    ],
    steps: [
      {
        kind: "resume" as StepKind,
        title: "简历如何完善",
        desc: "结合 JD 的核心能力点，对这份简历做 3 处针对性改写。",
        srcId: "s.resume",
        mindset: "",
        items: [
          {
            point: "最近一段经历缺少可验证的工程指标。",
            suggestion:
              "「主导前端 CI/CD 改造：引入并行构建与缓存策略，构建时长 18min → 6min；参与 6 次线上故障复盘，主写 2 份 RCA。」",
            evidence: "对应 JD 第 4 条「owns deployment pipeline & participates in on-call」。",
          },
        ] as StepItem[],
      },
      {
        kind: "interview" as StepKind,
        title: "面试准备哪段经历",
        desc: "锁定最匹配的经历，按 STAR 拆解并准备追问。",
        srcId: "s.interview",
        mindset: "沉稳自信，遇到不会的问题先讲思路再讲边界。",
        items: [
          {
            point: "重点准备「交易前端重构」这段经历。",
            suggestion: "用 STAR 拆一遍：背景规模、你的决策、模块拆分方案、上线后的指标变化，并准备一个具体的故障排查实例。",
            evidence: "该经历与 JD 第 1 条架构 own 的诉求直接对齐。",
          },
        ] as StepItem[],
      },
      {
        kind: "portfolio" as StepKind,
        title: "作品集要放什么",
        desc: "该岗位未强制要求作品集。",
        srcId: "s.portfolio",
        mindset: "",
        items: [] as StepItem[],
      },
    ],

    dimensions: dims,
    sources: [
      { label: "岗位 JD 原文 · " + job.title + ", " + job.co, at: "2026-07-28" },
      { label: "公司公开信息 · 团队规模与技术博客", at: "2026-07-26" },
      { label: "同类岗位对照 · 4 个同级 JD 的能力要求交集", at: "2026-07-25" },
      { label: "你的画像快照 · Profile v3", at: "2026-07-30" },
    ],
    pipeline: [
      { step: "解析 JD", detail: "抽取硬性要求 8 条、软性偏好 5 条，标注可验证性。" },
      { step: "解析画像", detail: "读取 Profile v3 的 8 维能力分与证据引用位置。" },
      { step: "维度对齐", detail: "将 JD 要求逐条映射到 8 个能力维度，标记命中 / 部分命中 / 缺失。" },
      { step: "打分", detail: "按维度权重加权得出匹配分，并输出扣分归因。" },
      { step: "生成建议", detail: "由扣分归因反推「投前 3 步」，每步绑定其对应缺口 ID。" },
    ],
    trace: [
      { t: "11:02:14", s: "parse_jd", d: "抽取 13 条要求，其中 4 条标记为硬性且可验证。" },
      { t: "11:02:19", s: "align_dimensions", d: "6/8 维度命中，缺口集中于「工程素养」。" },
      { t: "11:02:23", s: "score", d: "加权匹配分 " + m + "，主要扣分项 −8 / −6。" },
      { t: "11:02:27", s: "strategy", d: "生成 3 条行动建议，预计补齐后 " + Math.min(99, m + 8) + "。" },
    ],
  };
}

export type MatchReport = ReturnType<typeof reportTemplate>;

/* ---------- backend match_reports row → the shape the Match page renders ---------- */
type BackendReport = {
  score: number;
  decision: { flag?: string; win?: string; rank?: string; overview?: string; missingCore?: string[] };
  judgements?: {
    kind: string;
    title: string;
    desc: string;
    tags?: string[];
    evidence?: { mine?: string; required?: string; reasoning?: string; impact?: string };
  }[];
  steps?: { title: string; desc: string; why?: string; effect?: string; sample?: string }[];
  dimension_scores?: { key: string; label: string; score: number | null; level: string; core?: boolean; why?: string }[];
  sources?: { label: string; at: string }[];
  reasoning_trace?: string | null;
  pipeline?: { step: string; detail: string }[];
  decision_factors?: { step: string; detail: string }[];
  rationale_summary?: string | null;
};

const MARKS: Record<string, string> = { 最大优势: "", 最大缺口: "w", 最大风险: "i" };
const SRC_IDS = ["j.strength", "j.gap", "j.risk"];
const STEP_IDS = ["s.resume", "s.portfolio", "s.interview"];

export function reportFromBackend(job: Job, r: BackendReport): MatchReport {
  const base = reportTemplate({ ...job, m: r.score });
  const d = r.decision || {};

  // Reasoning is rendered from real model output only — no mock fallback.
  let factors: { step: string; detail: string }[] = Array.isArray(r.decision_factors) ? r.decision_factors : [];
  if (!factors.length) {
    try {
      const parsed = JSON.parse(r.reasoning_trace || "[]") as { step: string; detail: string }[];
      if (Array.isArray(parsed)) factors = parsed;
    } catch {
      factors = [];
    }
  }
  if (r.rationale_summary && !factors.some((f) => f.step === "结论")) {
    factors = [...factors, { step: "结论", detail: r.rationale_summary }];
  }
  const trace = factors.map((p, i) => ({ t: String(i + 1).padStart(2, "0"), s: p.step, d: p.detail }));

  return {
    ...base,
    jobId: job.id,
    job: { ...job, m: r.score },
    score: r.score,
    overview: d.overview || base.overview,
    decision: {
      ...base.decision,
      flag: d.flag || base.decision.flag,
      score: r.score,
      win: d.win || base.decision.win,
      rank: d.rank || base.decision.rank,
    },
    judgements: (r.judgements || []).map((j, i) => ({
      kind: j.kind,
      mark: MARKS[j.kind] ?? "",
      title: j.title,
      desc: j.desc,
      tags: j.tags || [],
      srcId: SRC_IDS[i] || "j." + i,
      evidence: {
        我方证据: j.evidence?.mine || "—",
        岗位要求: j.evidence?.required || "—",
        推理: j.evidence?.reasoning || "—",
        影响: j.evidence?.impact || "—",
      },
    })),
    steps: (r.steps || []).map((s, i) => ({
      title: s.title,
      desc: s.desc,
      srcId: STEP_IDS[i] || "s." + i,
      evidence: {
        为什么: s.why || "—",
        预期效果: s.effect || "—",
        参考写法: s.sample || "—",
      },
    })),
    dimensions: (r.dimension_scores || []).map((x) => ({
      name: x.label,
      score: x.score == null ? 0 : Math.round((x.score / 5) * 100),
    })),
    sources: r.sources?.length ? r.sources : [],
    pipeline: Array.isArray(r.pipeline) ? r.pipeline : [],
    trace,
  };
}


export function getMatchReport(jobId: string): MatchReport | null {
  const job = getJob(jobId);
  if (!job) return null;
  const stored = read<Record<string, MatchReport>>(KEYS.reports, {})[jobId];
  if (stored) return stored;
  return reportTemplate(job);
}
export function putMatchReport(report: MatchReport) {
  const all = read<Record<string, MatchReport>>(KEYS.reports, {});
  all[report.jobId] = report;
  write(KEYS.reports, all);
}

/* ---------- pure UI state ---------- */
export function getUI<T = Record<string, unknown>>(page: string): T {
  return ((read<Record<string, unknown>>(KEYS.ui, {}) || {})[page] || {}) as T;
}
export function setUI(page: string, state: Record<string, unknown>) {
  const all = read<Record<string, Record<string, unknown>>>(KEYS.ui, {}) || {};
  all[page] = Object.assign(all[page] || {}, state);
  write(KEYS.ui, all);
}

/* ---------- focus target for cross-page jumps ---------- */
export function focusId(search?: string): string | null {
  const u = new URLSearchParams(search ?? window.location.search).get("focus");
  if (u) return u;
  const f = localStorage.getItem("wfy.focus");
  if (f) localStorage.removeItem("wfy.focus");
  return f;
}
export function jobParam(search?: string): string | null {
  return new URLSearchParams(search ?? window.location.search).get("job");
}

/* ---------- keep application scores in sync with the latest match report ---------- */
export async function refreshApplicationScores(): Promise<Application[] | null> {
  const list = getApplications();
  const ids = list.map((a) => a.id).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (!ids.length) return null;
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase
    .from("match_reports")
    .select("job_profile_id, score, updated_at")
    .in("job_profile_id", ids)
    .eq("status", "succeeded")
    .order("updated_at", { ascending: false });
  if (error || !data?.length) return null;

  const latest = new Map<string, number>();
  for (const r of data) {
    if (r.score == null) continue;
    if (!latest.has(r.job_profile_id)) latest.set(r.job_profile_id, r.score as number);
  }

  let changed = false;
  const next = list.map((a) => {
    const s = latest.get(a.id);
    if (s == null || s === a.m) return a;
    changed = true;
    const job = getJob(a.id);
    if (job) putJob({ ...job, m: s });
    return { ...a, m: s, body: (a.body || "").replace(/匹配\s*\d+\s*%/g, "匹配 " + s + "%") };
  });
  if (!changed) return null;
  saveApplications(next);
  return next;
}
