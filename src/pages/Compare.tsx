import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import {
  applyToJob,
  focusId,
  getMatchReport,
  getPool,
  getPoolMeta,
  removeFromPool,
  setPoolMeta,
  setUI,
  type Job,
} from "@/lib/wfy";
import { compareSummary, aiMessage } from "@/lib/ai";
import "@/styles/pages/compare.css";

const RINGS = [140, 220, 290];
const ringOf = (m: number) => (m >= 85 ? 0 : m >= 70 ? 1 : 2);

function layout(jobs: Job[]) {
  const out: Record<string, { x: number; y: number }> = {};
  const buckets: Job[][] = [[], [], []];
  jobs.forEach((j) => buckets[ringOf(j.m)].push(j));
  buckets.forEach((list, ri) => {
    [...list]
      .sort((a, b) => b.m - a.m)
      .forEach((j, i, arr) => {
        const a = ((-90 + (360 / arr.length) * i) * Math.PI) / 180;
        out[j.id] = { x: Math.cos(a) * RINGS[ri], y: Math.sin(a) * RINGS[ri] };
      });
  });
  return out;
}

function requirementsOf(j: Job): string[] {
  const r = getMatchReport(j.id);
  const reqs = (r?.judgements || [])
    .map((x) => (x.evidence as Record<string, string> | undefined)?.["岗位要求"])
    .filter((x): x is string => !!x && x !== "—");
  const uniq = Array.from(new Set(reqs)).slice(0, 3);
  return uniq.length ? uniq : [j.yes, j.no].filter(Boolean);
}

const SUMMARY_KEY = "wfy.compareSummaries";
const readCache = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(SUMMARY_KEY) || "{}");
  } catch {
    return {};
  }
};

export default function Compare() {
  const navigate = useNavigate();
  const location = useLocation();
  const [jobs, setJobs] = useState<Job[]>(getPool());
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [summary, setSummary] = useState<{ state: "idle" | "loading" | "ok" | "err"; text: string }>({ state: "idle", text: "" });
  const [, bump] = useState(0);
  const [editReason, setEditReason] = useState<{ id: string; value: string } | null>(null);
  const [editLink, setEditLink] = useState<{ id: string; value: string } | null>(null);
  const [confirm, setConfirm] = useState<Job | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const reqSeq = useRef(0);

  const pos = useMemo(() => layout(jobs), [jobs]);
  const chosen = selected.map((id) => jobs.find((j) => j.id === id)).filter(Boolean) as Job[];

  useEffect(() => {
    const f = focusId(location.search);
    if (f && jobs.some((j) => j.id === f)) setSelected([f]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 6 ? s : [...s, id]));

  async function loadSummary(list: Job[]) {
    if (list.length < 2) return setSummary({ state: "idle", text: "" });
    const key = list.map((j) => j.id).sort().join("|");
    const cached = readCache()[key];
    if (cached) return setSummary({ state: "ok", text: cached });
    const seq = ++reqSeq.current;
    setSummary({ state: "loading", text: "" });
    try {
      const { summary: text } = await compareSummary(
        list.map((j) => ({ title: j.title, company: j.co, match: j.m, requirements: requirementsOf(j) }))
      );
      if (seq !== reqSeq.current) return;
      localStorage.setItem(SUMMARY_KEY, JSON.stringify({ ...readCache(), [key]: text }));
      setSummary({ state: "ok", text });
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setSummary({ state: "err", text: aiMessage(e) });
    }
  }

  function startCompare() {
    setComparing(true);
    loadSummary(chosen);
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  useEffect(() => {
    if (comparing) {
      if (chosen.length === 0) setComparing(false);
      else loadSummary(chosen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join("|")]);

  function doRemove(j: Job) {
    removeFromPool(j.id);
    setJobs(getPool());
    setSelected((s) => s.filter((x) => x !== j.id));
    setConfirm(null);
  }

  const hovered = hover ? jobs.find((j) => j.id === hover.id) : null;

  return (
    <div className="p-compare">
      <main className="page">
        <TopBar date={`Pool · ${jobs.length} jobs`} />

        <div className="head-row">
          <div>
            <div className="caption">04 · Compare</div>
            <h1 style={{ marginTop: 16 }}>
              Orbit
              <br />
              the pool.
            </h1>
          </div>
          <p className="caption">
            这里是你「稍后考虑」的岗位。越靠近中心，匹配度越高。悬停查看概要，点选多个岗位即可并排对比。
          </p>
        </div>

        <div className="pool-bar">
          <span className="caption">
            {jobs.length === 0
              ? "比较池为空 · 在匹配页点击「稍后考虑」添加岗位"
              : selected.length === 0
                ? "点选岗位进行对比"
                : `已选 ${selected.length} 个${selected.length < 2 ? " · 再选 1 个即可对比" : ""}`}
          </span>
          <div className="pool-actions">
            {selected.length > 0 && (
              <button className="btn ghost" type="button" onClick={() => setSelected([])}>
                清空选择
              </button>
            )}
            <button className="btn" type="button" disabled={selected.length < 1} onClick={startCompare}>
              {selected.length >= 2 ? `对比所选 (${selected.length}) →` : "查看所选 →"}
            </button>
          </div>
        </div>

        <section className="stage-center">
          <div className="pool" onMouseLeave={() => setHover(null)}>
            <svg viewBox="-400 -320 800 640" id="orbit">
              {RINGS.map((r) => (
                <circle key={r} className="ring" r={r} />
              ))}
              <circle className="center" r="52" />
              <text className="center-label" y="-2">YOU</text>
              <text className="center-sub" y="16">Match core</text>
              {jobs.map((j) => {
                const p = pos[j.id];
                const on = selected.includes(j.id);
                return (
                  <g key={j.id} transform={`translate(${p.x} ${p.y})`}>
                    <circle
                      className={"node" + (on ? " active" : "")}
                      r="8"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`${j.co} ${j.title}`}
                      tabIndex={0}
                      onClick={() => toggle(j.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(j.id)}
                      onMouseMove={(e) => setHover({ id: j.id, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(null)}
                    />
                    <text className="node-label" x="14" y="0">{j.co.toUpperCase()}</text>
                    <text className="node-label sub" x="14" y="13">
                      {j.title.length > 14 ? j.title.slice(0, 14) + "…" : j.title}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        {hovered && hover && (
          <div className="hover-card" style={{ left: hover.x + 18, top: hover.y - 12 }}>
            <div className="hc-t">{hovered.co} · {hovered.title}</div>
            <div className="hc-r"><span>Match</span><span>{hovered.m}%</span></div>
            <div className="hc-r"><span>Salary</span><span>{hovered.s || "—"}</span></div>
            <div className="hc-k">{selected.includes(hovered.id) ? "点击取消选择" : "点击选中"}</div>
          </div>
        )}

        {comparing && chosen.length > 0 && (
          <section className="cmp" ref={tableRef}>
            <div className="cmp-head">
              <div>
                <div className="caption">Compare / Deep comparison</div>
                <div className="cmp-crumb">
                  <button type="button" className="link" onClick={() => { setComparing(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    ← 返回轨道
                  </button>
                  <span> / {chosen.map((j) => j.co).join(" 与 ")}</span>
                </div>
              </div>
            </div>

            {chosen.length >= 2 && (
              <div className="cmp-ai">
                <div className="caption">AI · 关键差异</div>
                {summary.state === "loading" && (
                  <div className="moon" style={{ marginTop: 12 }}><i /><i /><i /><i /><i /></div>
                )}
                {summary.state === "ok" && <p>{summary.text}</p>}
                {summary.state === "err" && (
                  <p className="cmp-err">
                    {summary.text}{" "}
                    <button type="button" className="link" onClick={() => loadSummary(chosen)}>重试</button>
                  </p>
                )}
              </div>
            )}

            <div className="cmp-grid" style={{ gridTemplateColumns: `120px repeat(${chosen.length}, minmax(200px, 1fr))` }}>
              <div />
              {chosen.map((j) => (
                <div key={"h" + j.id} className="cmp-col-h">
                  <strong>{j.co}</strong>
                  <span>{j.title}</span>
                </div>
              ))}

              <div className="cmp-rl">岗位要求</div>
              {chosen.map((j) => (
                <div key={"r" + j.id} className="cmp-cell">
                  <ul>{requirementsOf(j).map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              ))}

              <div className="cmp-rl">匹配度</div>
              {chosen.map((j) => (
                <div key={"m" + j.id} className="cmp-cell cmp-score">{j.m}%</div>
              ))}

              <div className="cmp-rl">我的犹豫</div>
              {chosen.map((j) => (
                <div key={"w" + j.id} className="cmp-cell">
                  {editReason?.id === j.id ? (
                    <>
                      <textarea className="cmp-input" autoFocus rows={3} maxLength={200} placeholder="写下你的犹豫原因" value={editReason.value}
                        onChange={(e) => setEditReason({ id: j.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditReason(null);
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setPoolMeta(j.id, { reason: editReason.value.trim() }); setEditReason(null); bump((n) => n + 1); }
                        }} />
                      <span className="muted">回车保存 · Esc 取消</span>
                    </>
                  ) : (
                    <button type="button" className={"link" + (getPoolMeta(j.id).reason ? "" : " muted")} style={{ textAlign: "left" }} onClick={() => setEditReason({ id: j.id, value: getPoolMeta(j.id).reason || "" })}>
                      {getPoolMeta(j.id).reason || "未填写 · 补充"}
                    </button>
                  )}
                </div>
              ))}

              <div className="cmp-rl">投递链接</div>
              {chosen.map((j) => {
                const link = getPoolMeta(j.id).link;
                if (editLink?.id === j.id) {
                  const ok = !editLink.value.trim() || /^https?:\/\/\S+$/i.test(editLink.value.trim());
                  return (
                    <div key={"k" + j.id} className="cmp-cell">
                      <input
                        className="cmp-input"
                        autoFocus
                        placeholder="粘贴投递链接"
                        value={editLink.value}
                        onChange={(e) => setEditLink({ id: j.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditLink(null);
                          if (e.key === "Enter" && ok) {
                            setPoolMeta(j.id, { link: editLink.value.trim() });
                            setEditLink(null);
                            bump((n) => n + 1);
                          }
                        }}
                      />
                      <span className="muted">{ok ? "回车保存 · Esc 取消" : "需以 http(s):// 开头"}</span>
                    </div>
                  );
                }
                return (
                  <div key={"k" + j.id} className="cmp-cell">
                    {link ? (
                      <span style={{ display: "inline-flex", gap: 14 }}><a href={link} target="_blank" rel="noopener noreferrer" className="link">打开投递页 ↗</a><button type="button" className="link muted" onClick={() => setEditLink({ id: j.id, value: link })}>修改</button></span>
                    ) : (
                      <button type="button" className="link muted" onClick={() => setEditLink({ id: j.id, value: "" })}>
                        未填写 · 补充
                      </button>
                    )}
                  </div>
                );
              })}

              <div />
              {chosen.map((j) => (
                <div key={"a" + j.id} className="cmp-cell cmp-actions">
                  <button className="btn ghost" type="button" onClick={() => { setUI("match", { jobId: j.id }); navigate("/match?job=" + encodeURIComponent(j.id)); }}>
                    查看匹配
                  </button>
                  <button className="btn" type="button" onClick={() => { applyToJob(j); navigate("/delivery?focus=" + encodeURIComponent(j.id)); }}>
                    投递 →
                  </button>
                  <button className="btn ghost" type="button" onClick={() => setConfirm(j)}>
                    移出比较池
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className={"mask" + (confirm ? " on" : "")} onClick={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div className="dlg">
            <h5>Remove from pool?</h5>
            <p>{confirm ? `将 ${confirm.co} · ${confirm.title} 从比较池中移出，是否继续？` : ""}</p>
            <div className="row">
              <button className="btn ghost" onClick={() => setConfirm(null)}>取消</button>
              <button className="btn" onClick={() => confirm && doRemove(confirm)}>确认移出</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
