/* =============================================================
   WFY shared data layer  ·  the ONLY place that touches storage
   -------------------------------------------------------------
   Every page reads/writes through window.WFY. When the real API
   arrives, swap the bodies of read()/write() + the get* functions
   for fetch calls — no page code needs to change.
   ============================================================= */
(function () {
  "use strict";

  var K = {
    pool: "wfy.pool",                 // string[]  job ids
    apps: "wfy.applications",         // Application[]
    reports: "wfy.matchReports",      // { [jobId]: MatchReport }
    jobs: "wfy.jobs",                 // { [jobId]: JobProfile }  (user added)
    ui: "wfy.ui",                     // { [page]: any }  pure UI state
    migrated: "wfy.migrated.v1",
  };

  function read(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) { return d; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- ids ---------- */
  function slugId(co, title) {
    return String(co + "-" + title)
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /* ---------- job catalog (seed = today's static prototype data) ---------- */
  var SEED_JOBS = [
    { title: "Senior Frontend", co: "Stripe",     loc: "Remote / SF", m: 78, s: "$180K–220K", yes: "Craft · Product", no: "Team > 60" },
    { title: "Design Engineer", co: "Linear",     loc: "Remote",      m: 84, s: "$170K–210K", yes: "Craft · Speed",   no: "Small team OK" },
    { title: "Web Platform",    co: "Vercel",     loc: "Hybrid NYC",  m: 72, s: "$160K–200K", yes: "Perf",            no: "Hybrid required" },
    { title: "Staff FE",        co: "Notion",     loc: "Remote",      m: 68, s: "$210K–260K", yes: "Editor systems",  no: "Long tenure need" },
    { title: "Frontend Lead",   co: "Figma",      loc: "SF",          m: 88, s: "$220K–270K", yes: "Design tools",    no: "Onsite" },
    { title: "UI Systems",      co: "Retool",     loc: "Remote",      m: 66, s: "$150K–190K", yes: "Design system",   no: "B2B focus" },
    { title: "Product Eng",     co: "Raycast",    loc: "Remote EU",   m: 81, s: "€120K–160K", yes: "Product craft",   no: "Time zone" },
    { title: "FE / DX",         co: "Warp",       loc: "SF",          m: 63, s: "$170K–210K", yes: "DX focus",        no: "Onsite" },
    { title: "Frontend Arch",   co: "Databricks", loc: "Remote",      m: 59, s: "$230K–290K", yes: "Data UI",         no: "Enterprise" },
    { title: "Web Eng",         co: "OpenAI",     loc: "SF",          m: 91, s: "$220K–260K", yes: "Cutting edge",    no: "Onsite" },
    { title: "UI Engineer",     co: "Anthropic",  loc: "Remote",      m: 76, s: "$210K–250K", yes: "Research UI",     no: "Sec review" },
    { title: "Senior Web",      co: "Cloudflare", loc: "Remote",      m: 64, s: "$180K–220K", yes: "Edge platform",   no: "Legacy code" },
  ].map(function (j) { j.id = slugId(j.co, j.title); return j; });

  var SEED_MAP = {};
  SEED_JOBS.forEach(function (j) { SEED_MAP[j.id] = j; });

  function allJobs() {
    var extra = read(K.jobs, {});
    var out = SEED_JOBS.slice();
    Object.keys(extra).forEach(function (id) {
      if (!SEED_MAP[id]) out.push(extra[id]);
    });
    return out;
  }
  function getJob(id) {
    if (!id) return null;
    return SEED_MAP[id] || read(K.jobs, {})[id] || null;
  }
  function putJob(job) {
    if (!job) return null;
    job.id = job.id || slugId(job.co, job.title);
    if (!SEED_MAP[job.id]) {
      var extra = read(K.jobs, {});
      extra[job.id] = job;
      write(K.jobs, extra);
    }
    return job;
  }

  /* ---------- compare pool (ids only, no tombstones) ---------- */
  function getPoolIds() {
    var v = read(K.pool, null);
    if (!Array.isArray(v)) {                    // first run: seed with the catalog
      v = SEED_JOBS.map(function (j) { return j.id; });
      write(K.pool, v);
    }
    return v.filter(function (id) { return !!getJob(id); });
  }
  function getPool() { return getPoolIds().map(getJob); }
  function addToPool(job) {
    putJob(job);
    var ids = getPoolIds();
    if (ids.indexOf(job.id) < 0) { ids.push(job.id); write(K.pool, ids); }
    return job.id;
  }
  function removeFromPool(id) {
    write(K.pool, getPoolIds().filter(function (x) { return x !== id; }));
  }

  /* ---------- applications (single model, event driven) ---------- */
  var STATUSES = ["待投递", "已投递", "面试中", "结束"];

  var SEED_APPS = [
    { id: slugId("Stripe", "Senior Frontend"), status: "已投递", at: "2026-07-12",
      body: "今天把改过的自我介绍投出去了。CI/CD 那段补上后整体读起来更完整，团队规模的偏好我先没说，等到面试再谈。",
      quote: "我更在意工艺被认真对待——比起团队大小，这才是我最想问的问题。" },
    { id: slugId("Linear", "Design Engineer"), status: "面试中", at: "2026-07-10",
      body: "HR 回信说下周约一次 45 分钟的技术对话。对方直接问了我关于「输入延迟感」的看法，说明他们真的在意 craft，这是我今年遇到最有共鸣的团队之一。", quote: "" },
    { id: slugId("Raycast", "Product Eng"), status: "面试中", at: "2026-07-07",
      body: "技术二面聊得不错，最后 20 分钟主要在讨论时区。他们希望有 4 小时和欧洲重叠，我现在能做到的是 2 小时；这是个真正需要谈的分歧。", quote: "" },
    { id: slugId("Vercel", "Web Platform"), status: "结束", at: "2026-07-02",
      body: "拒信里提到「我们希望候选人能全职在纽约」。这是画像上明确写着的 Remote 偏好被现实撞了一下。加入知识库，作为对下一次决策的参考。", quote: "" },
    { id: slugId("Figma", "Frontend Lead"), status: "结束", at: "2026-06-28",
      body: "三周前的记录：Onsite 谈成 3 天到岗。签下的那一刻我意识到——如果没有对比页把它和 Stripe 并排看一眼，我可能会更犹豫。", quote: "" },
  ];

  function normalizeApp(a) {
    var job = getJob(a.id) || {};
    return {
      id: a.id,
      co: a.co || job.co || "—",
      title: a.title || job.title || "—",
      m: typeof a.m === "number" ? a.m : (job.m || 0),
      status: STATUSES.indexOf(a.status) > -1 ? a.status : "待投递",
      appliedAt: a.appliedAt || a.at || new Date().toISOString().slice(0, 10),
      updatedAt: a.updatedAt || a.appliedAt || a.at || new Date().toISOString().slice(0, 10),
      body: a.body || "",
      quote: a.quote || "",
      events: Array.isArray(a.events) ? a.events : [
        { status: a.status || "待投递", at: a.updatedAt || a.appliedAt || a.at || new Date().toISOString().slice(0, 10) },
      ],
    };
  }

  function getApplications() {
    var v = read(K.apps, null);
    if (!Array.isArray(v)) { v = SEED_APPS.slice(); write(K.apps, v.map(normalizeApp)); }
    return v.map(normalizeApp).sort(function (a, b) {
      return (b.appliedAt || "").localeCompare(a.appliedAt || "");
    });
  }
  function saveApplications(list) { write(K.apps, list.map(normalizeApp)); }

  function applyToJob(job) {
    putJob(job);
    var list = getApplications();
    if (list.some(function (a) { return a.id === job.id; })) return job.id;
    var today = new Date().toISOString().slice(0, 10);
    list.unshift(normalizeApp({
      id: job.id, co: job.co, title: job.title, m: job.m, status: "待投递",
      appliedAt: today, updatedAt: today,
      body: "匹配 " + job.m + "%，投前 3 步的建议尚未全部完成，先记录下来。",
      quote: "",
    }));
    saveApplications(list);
    return job.id;
  }

  function setStatus(id, status) {
    var today = new Date().toISOString().slice(0, 10);
    var list = getApplications().map(function (a) {
      if (a.id !== id) return a;
      a.status = status; a.updatedAt = today;
      a.events = a.events.concat([{ status: status, at: today }]);
      return a;
    });
    saveApplications(list);
  }

  function updateApplication(id, patch) {
    var list = getApplications().map(function (a) {
      return a.id === id ? Object.assign(a, patch) : a;
    });
    saveApplications(list);
  }

  /* ---------- match reports (contract the model will fill) ---------- */
  function reportTemplate(job) {
    var m = job.m;
    var flag = m >= 85 ? "优先投" : (m >= 70 ? "改完再投" : "可投不优先");
    var win = m >= 85 ? "高" : (m >= 75 ? "中高" : (m >= 65 ? "中" : "低"));
    var rank = m >= 85 ? "Top 1" : (m >= 75 ? "Top 3" : "备选");
    var risk = Math.max(10, 100 - m - 20);
    var dims = [
      ["专业技能", Math.min(99, m + 16)], ["系统设计", Math.min(99, m + 10)],
      ["执行交付", Math.min(99, m + 7)],  ["产品理解", Math.min(99, m + 4)],
      ["协作沟通", m], ["学习成长", Math.max(20, m - 2)],
      ["工程素养", Math.max(20, m - 24)], ["动机稳定性", Math.max(20, m - 30)],
    ].map(function (d) { return { name: d[0], score: d[1] }; });

    return {
      jobId: job.id,
      job: job,
      score: m,
      riskScore: risk,
      overview: "基于你的花瓣画像与该岗位的 24 个维度做对齐。整体处于「" + flag +
        "」区间，主要匹配点集中在系统设计与前端工艺，主要风险集中在团队规模与工程链路要求。",
      decision: {
        flag: flag, score: m, win: win, rank: rank,
        evidence: {
          "d.verdict": {
            判定依据: "8 个维度中 " + dims.filter(function (d) { return d.score >= 70; }).length +
              " 个达标，唯一硬缺口「工程素养 " + dims[6].score + "」属于表达缺失而非能力缺失。",
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
            判定依据: "匹配分处于 " + (Math.floor(m / 10) * 10) + "–" + (Math.floor(m / 10) * 10 + 10) +
              " 区间，且存在 1 个明确扣分项与 1 个面试风险点。",
            引用来源: "同类岗位对照 · 4 个同级 JD 的要求交集",
            置信度: "中",
          },
          "d.rank": {
            判定依据: "在当前对比池中综合排名靠前，薪资与技术栈契合度好，仅工程链路要求偏高。",
            引用来源: "对比池快照",
            置信度: "中",
          },
        },
      },
      judgements: [
        { kind: "最大优势", mark: "", title: "复杂前端系统的独立交付能力",
          desc: "主导过 3 个百万级 DAU 前端重构，与该岗位「负责" + job.title + "架构」的核心诉求直接对齐。",
          tags: ["专业技能", "执行交付"], srcId: "j.strength",
          evidence: {
            我方证据: "简历第 1 段：「主导交易前端重构，拆分 12 个模块，日活 320 万」。",
            岗位要求: "JD 第 1 条：「Own the architecture of our front-end」。",
            推理: "规模量级与 owner 角色同时命中，属于可直接复用的经验，而非近似经验。",
            影响: "+12 分（专业技能 / 执行交付）",
          } },
        { kind: "最大缺口", mark: "w", title: "缺少可验证的 CI/CD 与线上排障证据",
          desc: "JD 明确要求参与部署链路与值班，简历中无相关描述，画像该维度 " + dims[6].score + " 分。",
          tags: ["工程素养"], srcId: "j.gap",
          evidence: {
            我方证据: "简历第 2 段仅有「负责发布流程优化」，无工具、无指标、无值班记录。",
            岗位要求: "JD 第 4 条：「owns deployment pipeline & participates in on-call」。",
            推理: "要求为硬性且可量化，模糊表述在初筛阶段无法被判定为命中。",
            影响: "−8 分（工程素养 " + dims[6].score + "）",
          } },
        { kind: "最大风险", mark: "i", title: "团队规模偏好与岗位环境不一致",
          desc: "该团队 60+ 人、跨时区协作，你的画像偏好 ≤ 20 人小团队，面试中大概率被追问。",
          tags: ["协作沟通", "动机稳定性"], srcId: "j.risk",
          evidence: {
            我方证据: "画像动机维度：近 3 段经历团队规模 8 / 15 / 18 人，平均在职 14 个月。",
            岗位要求: "公司公开信息：团队 60+ 人，横跨 3 个时区，异步协作为主。",
            推理: "环境差异会同时触发「适配成本」与「稳定性」两类面试追问。",
            影响: "−6 分（协作沟通 / 动机稳定性）",
          } },
      ],
      steps: [
        { title: "简历如何完善",
          desc: "在最近一段经历下新增一条：主导 CI/CD 流水线改造，构建时长 18min → 6min，并注明线上故障复盘参与次数。",
          srcId: "s.resume",
          evidence: {
            为什么: "对应「最大缺口：缺少可验证的 CI/CD 与线上排障证据」。",
            预期效果: "匹配分 " + m + " → " + Math.min(99, m + 8) + "，胜算等级提升一档。",
            参考写法: "「主导前端 CI/CD 改造：引入并行构建与缓存策略，构建时长 18min → 6min；参与 6 次线上故障复盘，主写 2 份 RCA。」",
          } },
        { title: "作品集 / 项目表达要补什么",
          desc: "补一页该领域的前端架构图：模块划分、错误兜底、灰度发布策略，替换掉当前偏视觉的展示页。",
          srcId: "s.portfolio",
          evidence: {
            为什么: "JD 强调领域上下文，画像「产品理解」在该领域缺少证据。",
            预期效果: "产品理解 " + dims[3].score + " → " + Math.min(99, dims[3].score + 6) + "，强化「可直接上手」印象。",
            参考写法: "一页三栏：链路模块划分 / 失败与重试兜底 / 灰度与回滚策略，每栏一句结论 + 一个指标。",
          } },
        { title: "面试 / 自我介绍要准备什么",
          desc: "准备一段 60 秒回答：为什么愿意进入 60+ 人跨时区团队，用一段实际跨团队协作经历作为证据。",
          srcId: "s.interview",
          evidence: {
            为什么: "对应「最大风险：团队规模偏好与岗位环境不一致」，这是面试必问点。",
            预期效果: "降低动机稳定性质疑，风险分 " + risk + " → " + Math.max(10, risk - 12) + "。",
            参考写法: "「我此前在小团队负责全链路，但与海外团队做过 8 个月异步协作，习惯用文档与录屏推进决策，这正是我想进入更大规模组织的原因。」",
          } },
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

  function getMatchReport(jobId) {
    var job = getJob(jobId);
    if (!job) return null;
    var stored = read(K.reports, {})[jobId];
    if (stored) return stored;
    return reportTemplate(job);
  }
  function putMatchReport(report) {
    var all = read(K.reports, {});
    all[report.jobId] = report;
    write(K.reports, all);
  }

  /* ---------- pure UI state (never goes to the backend) ---------- */
  function getUI(page) { return (read(K.ui, {}) || {})[page] || {}; }
  function setUI(page, state) {
    var all = read(K.ui, {}) || {};
    all[page] = Object.assign(all[page] || {}, state);
    write(K.ui, all);
  }

  /* ---------- focus target for cross-page jumps (URL wins) ---------- */
  function focusId() {
    var u = new URLSearchParams(location.search).get("focus");
    if (u) return u;
    var f = localStorage.getItem("wfy.focus");
    if (f) localStorage.removeItem("wfy.focus");
    return f;
  }
  function goto(page, id) {
    location.href = "./" + page + ".html" + (id ? "?focus=" + encodeURIComponent(id) : "");
  }
  function jobParam() { return new URLSearchParams(location.search).get("job"); }

  /* ---------- one-time migration off the old scattered keys ---------- */
  (function migrate() {
    if (localStorage.getItem(K.migrated)) return;
    try {
      var legacy = read("wfy.deliveries", []);
      var statuses = read("wfy.entryStatus", {});
      var edits = read("wfy.entryEdits", {});
      if (legacy.length || Object.keys(statuses).length || Object.keys(edits).length) {
        var list = getApplications();
        legacy.forEach(function (d) {
          if (list.some(function (a) { return a.id === d.id; })) return;
          list.unshift(normalizeApp({
            id: d.id, co: d.co, title: d.title, m: d.m, status: d.status,
            appliedAt: [d.year, String(new Date(d.mon + " 1, 2000").getMonth() + 1).padStart(2, "0"), d.day].join("-"),
            body: d.body, quote: d.quote,
          }));
        });
        list = list.map(function (a) {
          var s = statuses[a.id];
          if (s) {
            var st = typeof s === "string" ? s : s.status;
            if (st) { a.status = st; a.updatedAt = (s.updatedAt || a.updatedAt).slice(0, 10); }
          }
          var e = edits[a.id];
          if (e) {
            if (e.title) { var p = String(e.title).split("·"); a.co = (p[0] || a.co).trim(); a.title = (p[1] || a.title).trim(); }
            if (e.text) a.body = e.text;
            if (e.quote) a.quote = e.quote;
          }
          return a;
        });
        saveApplications(list);
      }
      var removed = read("wfy.poolRemoved", []);
      if (removed.length) write(K.pool, getPoolIds().filter(function (id) { return removed.indexOf(id) < 0; }));
      ["wfy.deliveries", "wfy.entryStatus", "wfy.entryEdits", "wfy.poolRemoved",
        "wfy.state.match", "wfy.state.compare"].forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    localStorage.setItem(K.migrated, "1");
  })();

  window.WFY = {
    KEYS: K, STATUSES: STATUSES,
    slugId: slugId, allJobs: allJobs, getJob: getJob, putJob: putJob,
    getPool: getPool, addToPool: addToPool, removeFromPool: removeFromPool,
    getApplications: getApplications, saveApplications: saveApplications,
    applyToJob: applyToJob, setStatus: setStatus, updateApplication: updateApplication,
    getMatchReport: getMatchReport, putMatchReport: putMatchReport,
    getUI: getUI, setUI: setUI, focusId: focusId, goto: goto, jobParam: jobParam,
  };
})();
