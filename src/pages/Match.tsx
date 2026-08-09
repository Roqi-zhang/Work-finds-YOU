import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import ExportMenu from "@/components/swiss/ExportMenu";
import {
  getMatchReport,
  putMatchReport,
  reportFromBackend,
  getJob,
  putJob,

  jobParam,
  focusId,
  getUI,
  setUI,
  addToPool,
  applyToJob,
  type MatchReport,
} from "@/lib/wfy";
import { runMatch, aiMessage, isJobProfileId } from "@/lib/ai";
import "@/styles/pages/match.css";


type UIState = { jobId?: string; ev?: boolean; folds?: string[] };

function Fold({
  srcId,
  label,
  evidence,
  isOpen,
  onToggle,
  keepLabel,
}: {
  srcId: string;
  label: string;
  evidence: Record<string, string> | undefined;
  isOpen: boolean;
  onToggle: (id: string) => void;
  keepLabel?: boolean;
}) {
  const entries = evidence ? Object.entries(evidence) : [];
  return (
    <div className={"fold" + (isOpen ? " open" : "")} data-src-id={srcId}>
      <button className="ft" data-fold type="button" aria-expanded={isOpen} onClick={() => onToggle(srcId)}>
        <span>{keepLabel ? label : isOpen ? "收起依据" : label}</span>
        <span className="car">↓</span>
      </button>
      <div className="fb">
        <div className="fb-in">
          {entries.map(([k, v]) => (
            <div className="fr" key={k}>
              <span className="fk">{k}</span>
              <span className="fv">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Match() {
  const { search } = useLocation();
  const navigate = useNavigate();

  const jobId = useMemo(() => {
    return (
      jobParam(search) ||
      focusId(search) ||
      (getUI<UIState>("match").jobId as string | undefined) ||
      null
    );
  }, [search]);

  // `fresh=1` arrives from the match animation — never flash the previous report.
  const fresh = useMemo(() => new URLSearchParams(search).get("fresh") === "1", [search]);
  const localReport: MatchReport | null = useMemo(
    () => (jobId && !fresh ? getMatchReport(jobId) : null),
    [jobId, fresh],
  );
  const [report, setReport] = useState<MatchReport | null>(localReport);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setReport(localReport);
  }, [localReport]);

  // pull the real AI report; keep the local snapshot as fallback (e.g. signed out)
  useEffect(() => {
    if (!jobId) return;
    if (!isJobProfileId(jobId)) {
      setLoading(false);
      setLoadError("岗位画像已失效，请返回工作台重新建立岗位画像");
      return;
    }
    let alive = true;
    setLoading(true);
    setLoadError(null);
    runMatch(jobId)
      .then(({ report: r, job: backendJob }) => {
        if (!alive) return;
        // The local job store can be empty (e.g. matching straight from the
        // workbench), so fall back to the job the backend just returned.
        const bj = backendJob as Record<string, unknown> | undefined;
        const fallback = bj
          ? {
              id: String(bj.id ?? jobId),
              title: String(bj.title ?? "待确认"),
              co: String(bj.company ?? "待确认"),
              loc: String(bj.location ?? "待确认"),
              m: 0,
              s: "待确认",
              yes: "JD 匹配",
              no: "待确认",
            }
          : null;
        const job = getJob(jobId) || localReport?.job || fallback;
        if (job) {
          putJob(job);
          const mapped = reportFromBackend(job, r as never);
          putMatchReport(mapped);
          setReport(mapped);
        } else {
          setLoadError("岗位信息缺失，请返回工作台重新建立岗位画像");
        }
      })

      .catch((e) => {
        if (alive) setLoadError(aiMessage(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const initialUI = getUI<UIState>("match");
  const [evOpen, setEvOpen] = useState<boolean>(!!initialUI.ev);
  const [folds, setFolds] = useState<string[]>(Array.isArray(initialUI.folds) ? initialUI.folds : []);

  useEffect(() => {
    if (report) setUI("match", { jobId: report.jobId });
  }, [report]);


  const toggleFold = (id: string) => {
    setFolds((prev) => {
      const open = prev.indexOf(id) < 0;
      const next = prev.filter((n) => n !== id);
      if (open) next.push(id);
      setUI("match", { folds: next });
      return next;
    });
  };

  const toggleEv = () => {
    setEvOpen((prev) => {
      const next = !prev;
      setUI("match", { ev: next });
      return next;
    });
  };

  const reportRef = useRef<HTMLElement>(null);
  const bgTicksRef = useRef<SVGGElement | null>(null);
  const handRef = useRef<SVGLineElement | null>(null);

  useEffect(() => {
    const g = bgTicksRef.current;
    if (!g) return;
    g.innerHTML = "";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r1 = 660,
        r2 = i % 5 === 0 ? 640 : 650;
      const x1 = 700 + Math.cos(a) * r1,
        y1 = 700 + Math.sin(a) * r1;
      const x2 = 700 + Math.cos(a) * r2,
        y2 = 700 + Math.sin(a) * r2;
      const el = document.createElementNS("http://www.w3.org/2000/svg", "line");
      el.setAttribute("x1", String(x1));
      el.setAttribute("y1", String(y1));
      el.setAttribute("x2", String(x2));
      el.setAttribute("y2", String(y2));
      el.setAttribute("stroke", "currentColor");
      el.setAttribute("stroke-width", "0.5");
      el.style.color = "var(--ink)";
      g.appendChild(el);
    }
  }, []);

  useEffect(() => {
    if (!report) return;
    const hand = handRef.current;
    if (!hand) return;
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".progress a"));
    const targets = links.map((a) => document.querySelector<HTMLElement>(a.getAttribute("href") || ""));
    function onScroll() {
      const y = window.scrollY + window.innerHeight / 2;
      let active = 0;
      targets.forEach((t, i) => {
        if (t && t.offsetTop <= y) active = i;
      });
      links.forEach((l, i) => l.classList.toggle("on", i === active));
      const rot = links[active]?.dataset.hand;
      if (hand) hand.style.transform = `rotate(${rot}deg)`;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [report]);

  const isOpen = (id: string) => folds.indexOf(id) >= 0;

  const gradient = (v: number) => `linear-gradient(90deg, var(--ink-strong) 0 ${v}%, var(--paper) ${v}% 100%)`;

  const bgDial = (
    <div className="bg-dial" aria-hidden="true">
      <svg viewBox="0 0 1400 1400">
        <g className="rotor">
          <circle className="ring" cx="700" cy="700" r="680" />
          <circle className="ring" cx="700" cy="700" r="540" />
          <circle className="ring" cx="700" cy="700" r="400" />
          <circle className="ring" cx="700" cy="700" r="260" />
          <g ref={bgTicksRef} id="bg-ticks" />
        </g>
        <line className="hand" ref={handRef} id="hand" x1="700" y1="700" x2="700" y2="120" />
      </svg>
    </div>
  );

  if (!report) {
    return (
      <div className="p-match">
        {bgDial}
        <main className="page content" ref={reportRef}>
          <TopBar />
          <section className="screen" id="s1">
            <div>
              <div className="k">01 · Overview</div>
              <h2>
                {loading ? (
                  <>
                    正在
                    <br />
                    分析。
                  </>
                ) : (
                  <>
                    还没有
                    <br />
                    岗位。
                  </>
                )}
              </h2>
              <p>
                {loading
                  ? "正在对齐你的画像与该岗位要求，通常需要 10–30 秒。"
                  : loadError || "上传一份 JD 建立岗位画像，或从对比池里选择一个岗位，即可查看匹配分析报告。"}
              </p>
              <div className="cta-row" style={{ marginTop: 32 }}>
                <button className="btn" type="button" onClick={() => navigate("/workbench")}>
                  上传 JD 建立岗位画像 →
                </button>
                <button className="btn ghost" type="button" onClick={() => navigate("/compare")}>
                  从对比池选择 →
                </button>
              </div>
            </div>
            <div className="moon-score">
              <div className="m empty">
                <div className="lbl">{loading ? "ANALYSING…" : "AWAITING JD"}</div>
              </div>

            </div>
          </section>
        </main>
      </div>
    );
  }

  const R = report;
  const job = R.job;

  const onAddPool = () => {
    addToPool(job);
    navigate("/compare?focus=" + encodeURIComponent(job.id));
  };
  const onApply = () => {
    applyToJob(job);
    navigate("/delivery?focus=" + encodeURIComponent(job.id));
  };

  const fields: { fn: string; fv: React.ReactNode; srcId: string }[] = [
    { fn: "是否优先投", fv: R.decision.flag, srcId: "d.priorityFlag" },
    {
      fn: "匹配分",
      fv: (
        <>
          {R.decision.score}
          <small>/ 100</small>
        </>
      ),
      srcId: "d.score",
    },
    { fn: "胜算等级", fv: R.decision.win, srcId: "d.winLevel" },
    { fn: "投递优先级", fv: R.decision.rank, srcId: "d.rank" },
  ];

  return (
    <div className="p-match">
      <>
        {bgDial}
        <main className="page content" ref={reportRef}>
          <TopBar />

          <nav className="progress">
            <a href="#s1" className="on" data-hand="-140">01 Overview</a>
            <a href="#s2" data-hand="-70">02 决策</a>
            <a href="#s3" data-hand="0">03 判断</a>
            <a href="#s4" data-hand="70">04 投前 3 步</a>
            <a href="#s5" data-hand="140">05 来源</a>
          </nav>

          <section className="screen" id="s1">
            <div>
              <div className="k">01 · Overview</div>
              <h2>
                {R.score}%<br />
                match.
              </h2>
              <p>一句话：{R.overview}</p>
              <div className="cta-row" style={{ marginTop: 32 }}>
                <button className="btn" id="addPoolBtn" type="button" onClick={onAddPool}>
                  加入对比 →
                </button>
                <button className="btn" id="applyBtn" type="button" onClick={onApply}>
                  直接投递 →
                </button>
                <ExportMenu
                  fileBase={`Match-${R.score}`}
                  captureRef={reportRef}
                  buildDoc={() => ({
                    title: `匹配报告 · ${R.score}% match`,
                    subtitle: R.overview,
                    sections: [
                      {
                        heading: "01 · 核心决策",
                        lines: [
                          `是否优先投：${R.decision.flag}`,
                          `匹配分：${R.decision.score} / 100`,
                          `胜算等级：${R.decision.win}`,
                          `投递优先级：${R.decision.rank}`,
                        ],
                      },
                      {
                        heading: "02 · 三个关键判断",
                        lines: R.judgements.map((j) => `[${j.kind}] ${j.title} — ${j.desc}`),
                      },
                      {
                        heading: "03 · 投前 3 步",
                        lines: R.steps.map((st, i) => `${i + 1}. ${st.title} — ${st.desc}`),
                      },
                    ],
                  })}
                />
              </div>
            </div>
            <div className="moon-score">
              <div className="m" style={{ background: gradient(R.score) }}>
                <div className="lbl">Overall · {R.score}</div>
              </div>
            </div>
          </section>

          <section className="screen" id="s2">
            <div className="moon-score">
              <div className="m" style={{ background: gradient(R.score) }}>
                <div className="lbl">Decision · {R.decision.flag}</div>
              </div>
            </div>
            <div>
              <div className="k">01 · 核心决策</div>
              <h2>
                核心
                <br />
                决策。
              </h2>

              <Fold
                srcId="d.verdict"
                label="依据 · 整体推理链"
                evidence={R.decision.evidence["d.verdict"]}
                isOpen={isOpen("d.verdict")}
                onToggle={toggleFold}
                keepLabel
              />

              <div className="fields">
                {fields.map((f) => (
                  <div className="f" key={f.srcId}>
                    <div className="fn">{f.fn}</div>
                    <div className="fv">{f.fv}</div>
                    <Fold
                      srcId={f.srcId}
                      label="依据"
                      evidence={R.decision.evidence[f.srcId]}
                      isOpen={isOpen(f.srcId)}
                      onToggle={toggleFold}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="screen" id="s3">
            <div>
              <div className="k">02 · 三个关键判断</div>
              <h2>
                优势、缺口、
                <br />
                风险。
              </h2>
              <div className="risklist" style={{ marginTop: 32 }}>
                {R.judgements.map((j) => (
                  <div className="row" key={j.srcId}>
                    <span className={"k mark" + (j.mark ? " " + j.mark : "")}>{j.kind}</span>
                    <div>
                      <div className="t">{j.title}</div>
                      <div className="d">{j.desc}</div>
                      <div className="tags">
                        {j.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                      <Fold
                        srcId={j.srcId}
                        label="依据"
                        evidence={j.evidence}
                        isOpen={isOpen(j.srcId)}
                        onToggle={toggleFold}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="moon-score">
              <div className="m" style={{ background: gradient(R.riskScore) }}>
                <div className="lbl">Risk · {R.riskScore}</div>
              </div>
            </div>
          </section>

          <section className="screen" id="s4">
            <div className="moon-score">
              <div className="m" style={{ background: gradient(66) }}>
                <div className="lbl">Actions · {R.steps.length}</div>
              </div>
            </div>
            <div>
              <div className="k">03 · 投前 3 步</div>
              <h2>
                投前
                <br />
                3 步。
              </h2>
              <div className="risklist" style={{ marginTop: 32 }}>
                {R.steps.map((s, i) => {
                  const cap =
                    s.kind === "interview"
                      ? ["准备什么", "怎么准备", "为什么"]
                      : s.kind === "portfolio"
                        ? ["放什么", "具体建议", "依据"]
                        : ["要改什么", "修改建议", "证据"];
                  return (
                    <div className="row" key={s.srcId}>
                      <span className="k">{String(i + 1).padStart(2, "0")}</span>
                      <div>
                        <div className="t">{s.title}</div>
                        <div className="d">{s.desc}</div>
                        <div className="step-items">
                          {s.items.map((it, n) => (
                            <div className="step-item" key={n}>
                              <div className="si-r">
                                <span className="k">{cap[0]}</span>
                                <span>{it.point}</span>
                              </div>
                              <div className="si-r">
                                <span className="k">{cap[1]}</span>
                                <span className="si-s">{it.suggestion}</span>
                              </div>
                              <div className="si-r">
                                <span className="k">{cap[2]}</span>
                                <span>{it.evidence}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {s.mindset && (
                          <div className="si-r si-mind">
                            <span className="k">心态提醒</span>
                            <span>{s.mindset}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

              </div>
            </div>
          </section>

          <section className="screen" id="s5" style={{ display: "block", minHeight: "auto", padding: "80px 0" }}>
            <div className="k">04 · 资料来源 · 分析思路</div>
            <h2
              style={{
                fontSize: 64,
                fontWeight: 500,
                letterSpacing: "-0.03em",
                lineHeight: 0.95,
                color: "var(--ink-strong)",
                margin: "16px 0 40px",
              }}
            >
              资料来源与
              <br />
              分析思路。
            </h2>

            <div className={"ev" + (evOpen ? " open" : "")} id="ev">
              <button className="ev-toggle" id="evToggle" type="button" aria-expanded={evOpen} onClick={toggleEv}>
                <span>{evOpen ? "收起 · Sources / Pipeline / Scores" : "展开 · Sources / Pipeline / Scores"}</span>

                <span className="car">↓</span>
              </button>
              <div className="ev-body">
                <div className="ev-block">
                  <div className="k">资料来源</div>
                  <div className="srcs">
                    {!R.sources.length && <div className="empty">本次分析未记录该环节</div>}
                    {R.sources.map((s) => (
                      <a href="#" key={s.label}>
                        <span>{s.label}</span>
                        <span className="k">{s.at}</span>
                      </a>
                    ))}
                  </div>
                </div>

                <div className="ev-block">
                  <div className="k">分析步骤</div>
                  <div className="steps">
                    {!R.pipeline.length && <div className="empty">本次分析未记录该环节</div>}
                    {R.pipeline.map((p, i) => (
                      <div className="r" key={p.step}>
                        <span className="n">{String(i + 1).padStart(2, "0")}</span>
                        <span className="s">{p.step}</span>
                        <span>{p.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ev-block">
                  <div className="k">分项评分</div>
                  <div className="bars">
                    {R.dimensions.map((d) => (
                      <div className="bar" key={d.name}>
                        <span className="n">{d.name}</span>
                        <span className="t" style={{ ["--v" as string]: d.score + "%" } as React.CSSProperties} />
                        <span className="v">{d.score}</span>
                      </div>
                    ))}
                  </div>
                </div>



              </div>
            </div>
          </section>
        </main>
      </>
    </div>
  );
}
