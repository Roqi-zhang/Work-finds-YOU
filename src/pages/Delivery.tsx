import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import {
  getApplications,
  refreshApplicationScores,
  setStatus,
  updateApplication,
  focusId,
  setUI,
  STATUSES,
  type Application,
} from "@/lib/wfy";
import "@/styles/pages/delivery.css";

const MON_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const pad = (n: number) => String(n).padStart(2, "0");

function parts(iso: string) {
  const d = new Date((iso || "") + "T00:00:00");
  return isNaN(d.getTime())
    ? { d: "--", mon: "---", y: "----", mm: "--", dd: "--" }
    : {
        d: pad(d.getDate()),
        mon: MON_NAMES[d.getMonth()],
        y: d.getFullYear(),
        mm: pad(d.getMonth() + 1),
        dd: pad(d.getDate()),
      };
}

type RailItem = { id: string; label: string; at: string; on: boolean; t: string };

export default function Delivery() {
  const navigate = useNavigate();
  const location = useLocation();
  const [apps, setApps] = useState<Application[]>(() => getApplications());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showQuoteFor, setShowQuoteFor] = useState<string | null>(null);
  const entriesRef = useRef<HTMLDivElement | null>(null);
  const h2Refs = useRef<Record<string, HTMLHeadingElement | null>>({});
  const pRefs = useRef<Record<string, HTMLParagraphElement | null>>({});
  const quoteRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const didFocus = useRef(false);

  const refresh = () => setApps(getApplications());

  // Scores live in the match reports — pull the latest ones in on every visit.
  useEffect(() => {
    let alive = true;
    refreshApplicationScores()
      .then((next) => {
        if (alive && next) setApps(getApplications());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const rail = useMemo(() => {
    const items: RailItem[] = [];
    apps.forEach((a) => {
      const seen: Record<string, number> = {};
      let isFirst = true;
      a.events
        .slice()
        .reverse()
        .forEach((ev) => {
          if (seen[ev.status]) return;
          seen[ev.status] = 1;
          const p = parts(ev.at);
          items.push({
            id: a.id,
            label: a.co + " · " + ev.status,
            at: ev.at,
            on: isFirst,
            t: p.mm + "·" + p.dd,
          });
          isFirst = false;
        });
    });
    items.sort((x, y) => (y.at || "").localeCompare(x.at || ""));
    return items;
  }, [apps]);

  const stats = useMemo(() => {
    const active = apps.filter((a) => a.status !== "结束").length;
    const interview = apps.filter((a) => a.status === "面试中").length;
    const offers = apps.filter((a) => a.status === "结束").length;
    const avg = apps.length ? Math.round(apps.reduce((s, a) => s + (a.m || 0), 0) / apps.length) : null;
    let cycle: number | null = null;
    const closed = apps.filter((a) => a.status === "结束" && a.appliedAt && a.updatedAt);
    if (closed.length) {
      cycle = Math.round(
        closed.reduce(
          (s, a) => s + Math.max(0, (new Date(a.updatedAt).getTime() - new Date(a.appliedAt).getTime()) / 86400000),
          0
        ) / closed.length
      );
    }
    return { active, interview, offers, avg, cycle };
  }, [apps]);

  useEffect(() => {
    if (didFocus.current) return;
    if (!apps.length) return;
    const focus = focusId(location.search);
    if (focus) {
      didFocus.current = true;
      const el = entriesRef.current?.querySelector(`[data-id="${focus}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [apps, location.search]);

  const handleStatusChange = (id: string, value: string) => {
    setStatus(id, value);
    refresh();
  };

  const handleEditToggle = (a: Application) => {
    if (editingId === a.id) {
      const h2 = h2Refs.current[a.id];
      const p = pRefs.current[a.id];
      const q = quoteRefs.current[a.id];
      const titleTxt = (h2?.textContent || "").split("·");
      updateApplication(a.id, {
        co: (titleTxt[0] || a.co).trim(),
        title: (titleTxt.slice(1).join("·") || a.title).trim(),
        body: (p && p.textContent) || "",
        quote: (q && q.textContent && q.textContent.trim()) || "",
      });
      setEditingId(null);
      setShowQuoteFor(null);
      refresh();
    } else {
      if (!a.quote) setShowQuoteFor(a.id);
      setEditingId(a.id);
      requestAnimationFrame(() => {
        h2Refs.current[a.id]?.focus();
      });
    }
  };

  return (
    <div className="p-delivery">
      <main className="page">
        <TopBar />

        <div className="head">
          <div>
            <div className="caption">05 · Delivery</div>
            <h1 style={{ marginTop: 16 }}>
              The
              <br />
              Job Journal.
            </h1>
          </div>
          <p>一份倒序阅读的求职日志。每一次投递、拒信、面试都是一段带小标题的段落；右侧竖轨记录状态变化的时间打点。</p>
        </div>

        <div className="top-tools">
          <div className="l">
            <button type="button" className="link-btn" onClick={() => setFormOpen(true)}>
              + 新增投递
            </button>
          </div>
          <div className="r">
            <input
              className="search"
              type="search"
              value={query}
              placeholder="搜索公司 / 岗位 / 备注"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>


        <section className="journal">
          <div className="entries" id="entries" ref={entriesRef}>
            {!apps.length ? (
              <div className="entry">
                <div className="date">
                  <span className="d">—</span>NO DATA
                </div>
                <div className="body">
                  <h2>还没有投递记录</h2>
                  <div className="sub">在匹配页点「直接投递」，或在对比池里选中岗位后点「投递」，记录会出现在这里。</div>
                  <div className="foot">
                    <a href="#" onClick={(e) => { e.preventDefault(); navigate("/compare"); }}>
                      去对比池 →
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              apps.map((a) => {
                const p = parts(a.appliedAt);
                const editing = editingId === a.id;
                const showQuote = !!a.quote || showQuoteFor === a.id;
                return (
                  <article className={"entry" + (editing ? " editing" : "")} data-id={a.id} key={a.id}>
                    <div className="date">
                      <span className="d">{p.d}</span>
                      {p.mon} · {p.y}
                    </div>
                    <div className="body">
                      <h2
                        ref={(el) => (h2Refs.current[a.id] = el)}
                        contentEditable={editing}
                        suppressContentEditableWarning
                      >
                        {a.co} · {a.title}
                      </h2>

                      <div className="status-row">
                        <span className="lb">投递状态</span>
                        <span className="status-sel">
                          <select value={a.status} onChange={(e) => handleStatusChange(a.id, e.target.value)}>
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </span>
                      </div>

                      <div className="sub">匹配 {a.m}%</div>
                      <p ref={(el) => (pRefs.current[a.id] = el)} contentEditable={editing} suppressContentEditableWarning>
                        {a.body}
                      </p>
                      {showQuote && (
                        <div
                          className="quote"
                          ref={(el) => (quoteRefs.current[a.id] = el)}
                          contentEditable={editing}
                          suppressContentEditableWarning
                        >
                          {a.quote}
                        </div>
                      )}

                      <div className="foot">
                        <a
                          href={`/match?focus=${encodeURIComponent(a.id)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate("/match?focus=" + encodeURIComponent(a.id));
                          }}
                        >
                          查看匹配
                        </a>
                        <a
                          href="/workbench"
                          onClick={(e) => {
                            e.preventDefault();
                            setUI("match", { jobId: a.id });
                            navigate("/workbench");
                          }}
                        >
                          岗位画像
                        </a>
                        <a
                          href={`/workbench?job=${encodeURIComponent(a.id)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate("/workbench?job=" + encodeURIComponent(a.id));
                          }}
                        >
                          个人画像
                        </a>
                        <button type="button" onClick={() => handleEditToggle(a)}>
                          {editing ? "完成" : "编辑"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <aside className="rail" id="rail">
            <span className="caption">Timeline</span>

            {rail.map((it, i) => (
              <div className={"dot" + (it.on ? " on" : "")} data-id={it.id} key={i}>
                <span className="m">{it.label}</span>
                <span className="t">{it.t}</span>
              </div>
            ))}

            <div className="stats">
              <div className="r">
                <span>Active</span>
                <span>{stats.active}</span>
              </div>
              <div className="r">
                <span>Interview</span>
                <span>{stats.interview}</span>
              </div>
              <div className="r">
                <span>Offers</span>
                <span>{stats.offers}</span>
              </div>
              <div className="r">
                <span>Avg match</span>
                <span>{stats.avg == null ? "—" : stats.avg + "%"}</span>
              </div>
              <div className="r">
                <span>Cycle</span>
                <span>{stats.cycle == null ? "—" : stats.cycle + "d"}</span>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
