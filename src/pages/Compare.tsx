import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import { applyToJob, focusId, getPool, getUI, removeFromPool, setUI, type Job } from "@/lib/wfy";
import "@/styles/pages/compare.css";

type PosJob = Job & { r?: number; a?: number };

const RINGS = [140, 220, 290];
function ringOf(m: number) {
  return m >= 85 ? 0 : m >= 70 ? 1 : 2;
}

function layout(jobs: PosJob[]) {
  const buckets: PosJob[][] = [[], [], []];
  jobs.forEach((j) => buckets[ringOf(j.m)].push(j));
  buckets.forEach((list, ri) => {
    list.sort((a, b) => b.m - a.m);
    const n = list.length;
    list.forEach((j, i) => {
      j.r = RINGS[ri];
      j.a = n ? -90 + (360 / n) * i : 0;
    });
  });
}

function pos(j: PosJob) {
  const rad = ((j.a || 0) * Math.PI) / 180;
  return { x: Math.cos(rad) * (j.r || 0), y: Math.sin(rad) * (j.r || 0) };
}

type Detail = {
  k: string;
  title: string;
  company: string;
  loc: string;
  match: string;
  salary: string;
  yes: string;
  no: string;
};

const EMPTY_DETAIL: Detail = {
  k: "00 / 00 · Empty pool",
  title: "对比池为空",
  company: "—",
  loc: "—",
  match: "—",
  salary: "—",
  yes: "—",
  no: "—",
};

export default function Compare() {
  const navigate = useNavigate();
  const location = useLocation();

  const jobsRef = useRef<PosJob[]>(getPool());
  const nodesRef = useRef<SVGGElement | null>(null);
  const lineRef = useRef<SVGPathElement | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(
    (getUI<{ selectedId?: string | null }>("compare").selectedId as string) || null
  );
  const [detail, setDetail] = useState<Detail>(EMPTY_DETAIL);
  const [disabled, setDisabled] = useState(true);
  const [lineOn, setLineOn] = useState(false);

  const [dlgOpen, setDlgOpen] = useState(false);
  const [dlgTitle, setDlgTitle] = useState("");
  const [dlgBody, setDlgBody] = useState("");
  const [dlgOkText, setDlgOkText] = useState("");
  const onConfirmRef = useRef<null | (() => void)>(null);

  function confirmDialog(title: string, body: string, okText: string, cb: () => void) {
    setDlgTitle(title);
    setDlgBody(body);
    setDlgOkText(okText);
    onConfirmRef.current = cb;
    setDlgOpen(true);
  }
  function closeDialog() {
    setDlgOpen(false);
    onConfirmRef.current = null;
  }

  useEffect(() => {
    if (!dlgOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dlgOpen]);

  function emptyState() {
    setSelectedId(null);
    setUI("compare", { selectedId: null });
    setLineOn(false);
    setDetail(EMPTY_DETAIL);
    setDisabled(true);
  }

  function activate(id: string) {
    const jobs = jobsRef.current;
    const i = jobs.findIndex((j) => j.id === id);
    if (i < 0) {
      emptyState();
      return;
    }
    setSelectedId(id);
    setUI("compare", { selectedId: id });
    if (nodesRef.current) {
      nodesRef.current.querySelectorAll(".node").forEach((n) => {
        n.classList.toggle("active", (n as SVGElement).dataset.id === id);
      });
    }
    const j = jobs[i];
    const { x, y } = pos(j);
    const cx = x * 0.35;
    const cy = y * 0.35 - 60 * Math.sign(y || 1);
    if (lineRef.current) {
      lineRef.current.setAttribute("d", `M 0 0 C ${cx} ${cy}, ${x - cx} ${y - cy}, ${x} ${y}`);
    }
    setLineOn(true);
    setDetail({
      k: `${String(i + 1).padStart(2, "0")} / ${jobs.length} · Selected`,
      title: j.title,
      company: j.co,
      loc: j.loc,
      match: j.m + "%",
      salary: j.s,
      yes: j.yes,
      no: j.no,
    });
    setDisabled(false);
  }

  function render() {
    const jobs = jobsRef.current;
    layout(jobs);
    const nodesEl = nodesRef.current;
    if (!nodesEl) return;
    nodesEl.innerHTML = "";
    jobs.forEach((j) => {
      const { x, y } = pos(j);
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("transform", `translate(${x} ${y})`);
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("class", "node" + (j.id === selectedId ? " active" : ""));
      c.setAttribute("r", "8");
      c.dataset.id = j.id;
      g.appendChild(c);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("class", "node-label");
      t.setAttribute("x", "14");
      t.setAttribute("y", "0");
      t.textContent = j.co.toUpperCase();
      g.appendChild(t);
      const t2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t2.setAttribute("class", "node-label sub");
      t2.setAttribute("x", "14");
      t2.setAttribute("y", "13");
      t2.textContent = (j.title || "").length > 14 ? j.title.slice(0, 14) + "…" : j.title || "";
      g.appendChild(t2);
      nodesEl.appendChild(g);
      c.addEventListener("mouseenter", () => activate(j.id));
      c.addEventListener("click", () => activate(j.id));
    });
  }

  useEffect(() => {
    render();
    const focus = focusId(location.search);
    let sel = selectedId;
    if (focus && jobsRef.current.some((j) => j.id === focus)) sel = focus;
    if (!jobsRef.current.length) emptyState();
    else activate(jobsRef.current.some((j) => j.id === sel) ? (sel as string) : jobsRef.current[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRemove() {
    const jobs = jobsRef.current;
    const j = jobs.find((x) => x.id === selectedId);
    if (!j) return;
    confirmDialog("Remove from pool?", `将 ${j.co} · ${j.title} 从对比池中移出，是否继续？`, "确认移出", () => {
      const idx = jobs.findIndex((x) => x.id === j.id);
      removeFromPool(j.id);
      jobsRef.current = getPool();
      if (!jobsRef.current.length) {
        render();
        emptyState();
        return;
      }
      const next = jobsRef.current[Math.min(idx, jobsRef.current.length - 1)];
      render();
      activate(next.id);
    });
  }

  function handleViewMatch() {
    const j = jobsRef.current.find((x) => x.id === selectedId);
    if (!j) return;
    setUI("match", { jobId: j.id });
    navigate("/match?job=" + encodeURIComponent(j.id));
  }

  function handleApply() {
    const jobs = jobsRef.current;
    const j = jobs.find((x) => x.id === selectedId);
    if (!j) return;
    applyToJob(j);
    navigate("/delivery?focus=" + encodeURIComponent(j.id));
  }


  return (
    <div className="p-compare">
      <main className="page">
        <TopBar date="Pool · 12 jobs" />

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
            岗位比较池将所有你不确定是否应该投递的岗位进行系统整理，外圈是匹配度较低的岗位，内圈是匹配度较高的岗位，在这里你可以有针对性的权衡利弊。
          </p>

        </div>

        <section className="stage">
          <div className="pool">
            <svg viewBox="-400 -320 800 640" id="orbit">
              <circle className="ring" r="140" />
              <circle className="ring" r="220" />
              <circle className="ring" r="290" />

              <circle className="center" r="52" />
              <text className="center-label" y="-2">
                YOU · L. HAN
              </text>
              <text className="center-sub" y="16">
                Match core
              </text>

              <path ref={lineRef} id="line" className={"bezier" + (lineOn ? " on" : "")} d="M0,0 C0,0 0,0 0,0" />

              <g id="nodes" ref={nodesRef}></g>
            </svg>
          </div>

          <aside className="detail" id="detail">
            <div className="k">{detail.k}</div>
            <div>
              <h3 id="d-title">{detail.title}</h3>
              <div className="meta">
                <span id="d-company">{detail.company}</span>
                <span>·</span>
                <span id="d-loc">{detail.loc}</span>
              </div>
            </div>
            <div className="row">
              <span>Match</span>
              <span id="d-match">{detail.match}</span>
            </div>
            <div className="row">
              <span>Salary</span>
              <span id="d-salary">{detail.salary}</span>
            </div>
            <div className="row">
              <span>Why Yes</span>
              <span id="d-yes">{detail.yes}</span>
            </div>
            <div className="row">
              <span>Why No</span>
              <span id="d-no">{detail.no}</span>
            </div>
            <div className="actions">
              <button className="btn ghost" id="viewMatchBtn" type="button" disabled={disabled} onClick={handleViewMatch}>
                查看匹配
              </button>
              <button className="btn" id="applyBtn" type="button" disabled={disabled} onClick={handleApply}>
                投递 →
              </button>
              <button className="btn ghost" id="removeBtn" type="button" disabled={disabled} onClick={handleRemove}>
                移出对比
              </button>
            </div>


            <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "0.5px solid var(--line)" }}>
              <div className="k" style={{ marginBottom: 8 }}>
                Pool loading
              </div>
              <div className="moon">
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
              </div>
            </div>
          </aside>
        </section>




        <div className={"mask" + (dlgOpen ? " on" : "")} id="mask" onClick={(e) => e.target === e.currentTarget && closeDialog()}>
          <div className="dlg">
            <h5 id="dlgTitle">{dlgTitle}</h5>
            <p id="dlgBody">{dlgBody}</p>
            <div className="row">
              <button className="btn ghost" id="dlgCancel" onClick={closeDialog}>
                取消
              </button>
              <button
                className="btn"
                id="dlgOk"
                onClick={() => {
                  const cb = onConfirmRef.current;
                  closeDialog();
                  if (cb) cb();
                }}
              >
                {dlgOkText}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
