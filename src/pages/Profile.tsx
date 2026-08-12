import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

import TopBar from "@/components/swiss/TopBar";
import ExportMenu from "@/components/swiss/ExportMenu";
import { getUI, setUI } from "@/lib/wfy";
import { parseResume, runMatch, aiMessage, isJobProfileId, type DimScored, type EvidenceDetail, type ResumeResult } from "@/lib/ai";
import { clearTask, getTask, startTask, subscribeTask } from "@/lib/tasks";
import { loadFile, saveFile } from "@/lib/filestore";
import "@/styles/pages/profile.css";

// ============ 8 competency dimensions (PRD 7.4) ============
const DIMS = [
  { key: "skill", label: "专业技能" },
  { key: "business", label: "业务理解" },
  { key: "analysis", label: "问题分析" },
  { key: "delivery", label: "执行交付" },
  { key: "comm", label: "沟通表达" },
  { key: "collab", label: "协作影响" },
  { key: "learning", label: "学习适应" },
  { key: "motive", label: "动机匹配" },
];

type DimResult = {
  score: number | null;
  strength?: string;
  evidence?: string;
  why?: string;
  action?: string;
  note?: string;
  seed?: number;
  evidenceDetail?: EvidenceDetail[];
};

type Point = [number, number];

// ---- traced from the reference line-art (image space 750 x 1060) ----
const C: Point = [355, 372]; // flower heart
const FRONT: Point[][] = [
  // 0 skill · top petal
  [[352, 366], [297, 270], [350, 230], [415, 235], [410, 300], [392, 322]],
  // 1 business · upper-left petal
  [[332, 362], [297, 272], [255, 287], [247, 365], [276, 368]],
  // 2 analysis · lower-left petal
  [[268, 360], [252, 410], [280, 437], [315, 460], [341, 434], [350, 392]],
  // 3 delivery · bottom petal
  [[352, 386], [356, 421], [371, 481], [415, 486], [436, 459], [461, 435], [416, 406]],
  // 4 comm · right petal
  [[364, 364], [395, 320], [440, 290], [477, 307], [472, 337], [505, 350], [495, 395], [460, 427], [416, 406]],
];
const BACK: Point[][] = [
  // 5 collab · peeking behind top-right
  [[408, 300], [430, 254], [463, 250], [474, 292], [452, 308]],
  // 6 learning · peeking behind left
  [[262, 356], [226, 349], [214, 386], [247, 403], [270, 384]],
  // 7 motive · peeking behind bottom-right
  [[441, 430], [473, 455], [464, 492], [426, 489], [417, 462]],
];

const STAMEN_PATHS = [
  "M 352 384 C 348 372 342 362 336 356", "M 336 356 c -3 -2 -6 0 -5 3 c 1 3 5 3 6 0",
  "M 350 382 C 344 378 334 376 326 378", "M 326 378 c -4 1 -5 4 -2 6 c 3 2 6 -1 5 -4",
  "M 354 380 C 356 368 356 358 354 348", "M 354 348 c -1 -3 2 -5 4 -3 c 2 2 1 5 -2 5",
  "M 357 381 C 362 372 370 365 379 361", "M 379 361 c 3 -1 5 1 4 4 c -2 3 -6 2 -6 -1",
  "M 358 384 C 366 381 375 381 383 383", "M 383 383 c 3 1 3 4 0 5 c -3 1 -6 -2 -4 -4",
  "M 349 388 C 340 389 331 393 325 399", "M 325 399 c -2 2 -1 5 2 5 c 3 0 5 -3 3 -5",
];

const RLINE_WIDTHS = [100, 92, 78, 96, 64, 88, 100, 72, 90, 58, 96, 84, 70, 92];

const ACCEPT_RE = /\.(pdf|docx?|png|jpe?g|webp|gif|bmp|heic|tiff?)$/i;

const STATE_MAP: Record<string, { tag: string; line: string; btn: string; hint: string }> = {
  empty: { tag: "STATE / EMPTY", line: "Let your flower bloom", btn: "上传简历", hint: "click or drag · PDF / Word / Image" },
  ready: { tag: "STATE / READY", line: "RESUME READY · WAITING TO BLOOM", btn: "建立画像", hint: "" },
  analysing: { tag: "STATE / LOADING", line: "ANALYSING…", btn: "分析中", hint: "PARSING · EXTRACTING · SCORING" },
  bloomed: { tag: "STATE / SUCCESS · 1 LOW-CONFIDENCE", line: "YOUR FLOWER HAS BLOOMED", btn: "进入匹配 →", hint: "hover 花瓣查看证据与得分理由" },
};

/** Backend evidence (level + score) → petal render model, always in DIMS order. */
function toDimResults(dims: DimScored[]): DimResult[] {
  const by = new Map(dims.map((d) => [d.key, d]));
  return DIMS.map((meta) => {
    const d = by.get(meta.key);
    return {
      score: d?.score ?? null,
      strength: d?.level ?? "missing",
      evidence: d?.evidence,
      why: d?.why,
      action: d?.action,
      note: d?.note,
      evidenceDetail: d?.evidenceDetail,
    } as DimResult;
  });
}


const GROUPS = [
  { title: "01 · Can do · 能不能做", idx: [0, 1, 2] },
  { title: "02 · Can deliver · 能不能做成", idx: [3, 4, 5] },
  { title: "03 · Long-term fit · 能不能长期适配", idx: [6, 7] },
];

// deterministic pseudo random (same resume → same flower)
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// closed Catmull-Rom → cubic bezier, keeps the hand-drawn soft lobes
function spline(pts: Point[]) {
  const n = pts.length;
  const d = [`M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d.push(`C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`);
  }
  return d.join(" ") + " Z";
}

// score (0..5 | null) → petal points, scaled radially around the heart + tiny hand jitter
function shape(base: Point[], score: number | null | undefined, seed: number): Point[] {
  const s = score == null ? 1.2 : score;
  const f = 0.87 + s * 0.052; // 2.5 => 1.0 (= the reference outline)
  const r = rng(seed * 7919 + 13);
  return base.map((p) => {
    const dx = p[0] - C[0];
    const dy = p[1] - C[1];
    const dist = Math.hypot(dx, dy);
    const near = Math.min(1, dist / 60); // anchor points near the heart
    const ff = 1 + (f - 1) * near;
    const j = (r() - 0.5) * 5 * near;
    const jj = (r() - 0.5) * 5 * near;
    return [C[0] + dx * ff + j, C[1] + dy * ff + jj] as Point;
  });
}

type PetalRef = {
  g: SVGGElement;
  p: SVGPathElement;
  base: Point[];
  index: number;
  dim: { key: string; label: string };
  delay: number;
};

type KeyPointUI = { title: string; detail: string };

type StoredProfile = {
  state: "ready" | "bloomed";
  name?: string;
  meta?: string;
  result?: DimResult[];
  keyPoints?: KeyPointUI[];
};


type TipState = {
  on: boolean;
  x: number;
  y: number;
  name: string;
  score: string;
  evi: string;
  why: string;
  act: string;
};

const EMPTY_TIP: TipState = { on: false, x: 0, y: 0, name: "", score: "", evi: "", why: "", act: "" };

export default function Profile({
  embedded = false,
  onStateChange,
}: { embedded?: boolean; onStateChange?: (s: string) => void } = {}) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { user } = useAuth();


  // JD-first: the target job comes from `?job=`, falling back to the last saved job profile
  // so leaving and returning to this page keeps the match target.
  const targetJobId = useMemo(() => {
    const fromUrl = new URLSearchParams(search).get("job");
    if (isJobProfileId(fromUrl)) return fromUrl;
    const m = getUI<{ jobId?: string }>("match");
    const matchedJobId = m?.jobId;
    if (isJobProfileId(matchedJobId)) return matchedJobId;
    const jp = getUI<{ job?: { id?: string } }>("jobprofile");
    const storedJobId = jp?.job?.id;
    return isJobProfileId(storedJobId) ? storedJobId : null;
  }, [search]);




  const [state, setStateVal] = useState<"empty" | "ready" | "analysing" | "bloomed">("empty");
  const [rName, setRName] = useState("resume.pdf");
  const [rMeta, setRMeta] = useState("PDF · 1.2 MB");
  const [hintOverride, setHintOverride] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [blooming, setBlooming] = useState(false);
  const [bloomedClass, setBloomedClass] = useState(false);
  const [result, setResult] = useState<DimResult[] | null>(null);
  const [keyPoints, setKeyPoints] = useState<KeyPointUI[]>([]);
  const [tip, setTip] = useState<TipState>(EMPTY_TIP);
  const [matching, setMatching] = useState(false);
  const [mergeGo, setMergeGo] = useState(false);
  const [mergeSvg, setMergeSvg] = useState("");
  const [mergeCap, setMergeCap] = useState("Overlaying two flowers · computing fit");

  
  const [dialog, setDialog] = useState<{ title: string; body: string; okText: string; onConfirm: (() => void) | null } | null>(null);

  const stageRef = useRef<HTMLElement>(null);
  const frontRootRef = useRef<SVGGElement | null>(null);
  const backRootRef = useRef<SVGGElement | null>(null);
  const stamenRootRef = useRef<SVGGElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const petalRefs = useRef<PetalRef[]>([]);
  const fileRef = useRef<File | null>(null);
  const metaRef = useRef({ name: "", meta: "" });
  const currentRef = useRef<DimResult[]>(DIMS.map(() => ({ score: null })));
  const stateRef = useRef(state);
  stateRef.current = state;
  const stateCbRef = useRef(onStateChange);
  stateCbRef.current = onStateChange;
  useEffect(() => { stateCbRef.current?.(state); }, [state]);



  function paint(data: DimResult[], animate: boolean) {
    currentRef.current = data;
    petalRefs.current.forEach((r, i) => {
      const d = data[i] || ({} as DimResult);
      r.p.setAttribute("d", spline(shape(r.base, d.score, i + (d.seed || 0))));
      r.g.setAttribute("class", "petal-g" + (d.score == null ? " weak" : ""));
      r.p.style.setProperty("--sd", d.score == null ? "0.1" : (0.12 + (d.score / 5) * 0.88).toFixed(3));
      if (animate) {
        const len = r.p.getTotalLength();
        r.p.style.setProperty("--len", String(len));
        r.p.style.animationDelay = r.delay + "s";
      } else {
        r.p.style.removeProperty("--len");
        r.p.style.removeProperty("animation-delay");
      }
    });
  }

  function showTip(e: React.MouseEvent, ref: PetalRef) {
    if (stateRef.current !== "bloomed" && stateRef.current !== "empty") return;
    const d = currentRef.current[ref.index] || ({} as DimResult);
    const box = visualRef.current!.getBoundingClientRect();
    let x = e.clientX - box.left + 18;
    let y = e.clientY - box.top + 12;
    x = Math.min(x, box.width - 262);
    y = Math.min(y, box.height - 180);
    setTip({
      on: true,
      x: Math.max(0, x),
      y: Math.max(0, y),
      name: ref.dim.label,
      score: d.evidence ? (d.score == null ? "证据不足" : d.score + "/5") : "—",
      evi:
        (d.evidenceDetail ?? [])
          .map((ev) => `${ev.claim || ev.label || "简历原文"}${ev.quotes?.length ? "「" + ev.quotes[0] + "」" : ""}`)
          .join("；") || d.evidence || "尚未建立画像",
      why: d.why || "上传简历后生成",
      act: "",

    });
  }

  function hideTip() {
    setTip((t) => ({ ...t, on: false }));
  }

  // ---- build petals once ----
  useEffect(() => {
    const refs: PetalRef[] = [];
    function makePetal(root: SVGGElement, base: Point[], index: number, delay: number) {
      const SVGNS = "http://www.w3.org/2000/svg";
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "petal-g");
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("class", "petal grow");
      p.setAttribute("d", spline(shape(base, 2.5, index)));
      g.appendChild(p);
      root.appendChild(g);
      const ref: PetalRef = { g, p, base, index, dim: DIMS[index], delay };
      refs[index] = ref;
      const move = (e: MouseEvent) => showTip(e as unknown as React.MouseEvent, ref);
      const leave = () => hideTip();
      g.addEventListener("mousemove", move);
      g.addEventListener("mouseleave", leave);
      g.addEventListener("click", move);
      return ref;
    }
    if (backRootRef.current && frontRootRef.current) {
      BACK.forEach((b, i) => makePetal(backRootRef.current!, b, 5 + i, 0.05 * i));
      FRONT.forEach((b, i) => makePetal(frontRootRef.current!, b, i, 0.18 + 0.11 * i));
    }
    petalRefs.current = refs;

    if (stamenRootRef.current) {
      const SVGNS = "http://www.w3.org/2000/svg";
      STAMEN_PATHS.forEach((d) => {
        const p = document.createElementNS(SVGNS, "path");
        p.setAttribute("class", "stamen");
        p.setAttribute("d", d);
        stamenRootRef.current!.appendChild(p);
      });
    }

    paint(DIMS.map((_, i) => ({ score: 2.5, seed: i })), false);

    // ---- restore previous state ----
    const saved = getUI<StoredProfile>("profile");
    if (saved && (saved as StoredProfile).state) {
      const s = saved as StoredProfile;
      if (s.name) {
        metaRef.current = { name: s.name, meta: s.meta || "" };
        setRName(s.name);
        setRMeta(s.meta || "");
      }
      if (s.state === "bloomed" && s.result) {
        paint(s.result, false);
        setBloomedClass(true);
        setStateVal("bloomed");
        setResult(s.result);
        setKeyPoints(s.keyPoints || []);
      } else if (s.state === "ready") {
        setStateVal("ready");
        // The picked file lives in IndexedDB, so a login round-trip keeps it.
        loadFile("resume").then((f) => { if (f) fileRef.current = f; });
      } else {
        setStateVal("empty");
      }
    } else {
      setStateVal("empty");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- background analysis: survives page switches ----
  useEffect(() => {
    const apply = (t: { status: string; result?: unknown }) => {
      if (t.status === "running") {
        setStateVal((prev) => (prev === "bloomed" ? prev : "analysing"));
      } else if (t.status === "done" && t.result) {
        const out = t.result as ResumeResult;
        const res = toDimResults(out.dimensions);
        paint(res, true);
        setBlooming(true);
        setBloomedClass(true);
        setResult(res);
        const kp = (out as ResumeResult & { keyPoints?: KeyPointUI[] }).keyPoints || [];
        setKeyPoints(kp);
        setStateVal("bloomed");
        saveStore({ state: "bloomed", name: metaRef.current.name, meta: metaRef.current.meta, result: res, keyPoints: kp });
        clearTask("resume");
      } else if (t.status === "error") {
        setStateVal("ready");
        setHintOverride(aiMessage(t.result));
        clearTask("resume");
      }
    };
    const unsub = subscribeTask("resume", apply);
    apply(getTask("resume"));
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ---- global dnd + escape ----
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handle(f);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    // In the workbench two panels share the window — only the drop zone handles files.
    if (!embedded) {
      window.addEventListener("dragover", onDragOver);
      window.addEventListener("drop", onDrop);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      document.removeEventListener("keydown", onKey);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveStore(v: StoredProfile | null) {
    setUI("profile", (v || {}) as unknown as Record<string, unknown>);
  }

  function handle(file: File | null | undefined) {
    if (!file) return;
    if (!ACCEPT_RE.test(file.name)) {
      setHintOverride("UNSUPPORTED · PDF / WORD / IMAGE ONLY");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setHintOverride("FILE TOO LARGE · MAX 10MB");
      return;
    }
    if (/\.doc$/i.test(file.name)) {
      setHintOverride("暂不支持 .DOC · 请另存为 .DOCX 或 PDF");
      return;
    }
    const kb = file.size / 1024;
    const name = file.name;
    const meta =
      (file.name.split(".").pop() || "FILE").toUpperCase() +
      " · " +
      (kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : Math.round(kb) + " KB");
    fileRef.current = file;
    void saveFile("resume", file);
    metaRef.current = { name, meta };
    setRName(name);
    setRMeta(meta);
    setResult(null);
    setHintOverride(null);
    setStateVal("ready");
    saveStore({ state: "ready", name, meta });
  }



  function reset() {
    setBlooming(false);
    setBloomedClass(false);
    setResult(null);
    setHintOverride(null);
    if (inputRef.current) inputRef.current.value = "";
    paint(DIMS.map((_, i) => ({ score: 2.5, seed: i })), false);
    setStateVal("empty");
    saveStore(null);
  }

  function closeDialog() {
    setDialog(null);
  }

  function confirmDialog(title: string, body: string, okText: string, cb: () => void) {
    setDialog({ title, body, okText, onConfirm: cb });
  }

  // Back follows the nav order instead of browser history.
  function onBack() {
    navigate("/");
  }


  function onRedo() {
    confirmDialog("Rebuild profile?", "重新建立画像将清空当前结果，需要重新上传简历，是否继续？", "确认重建", () => {
      reset();
      inputRef.current?.click();
    });
  }

  async function onMainBtn() {
    if (state === "empty") {
      inputRef.current?.click();
      return;
    }
    if (state === "bloomed") {
      // JD-first flow continues into the match; without a target JD, go pick one.
      if (!targetJobId) { navigate("/workbench"); return; }
      const svgEl = document.getElementById("flowerSvg");
      setMergeSvg(svgEl ? svgEl.outerHTML : "");
      setMergeCap("Overlaying two flowers · computing fit");
      setMergeGo(true);
      setMatching(true);
      try {
        // Not forced: an existing report for this resume + JD pair is reused as-is.
        await runMatch(targetJobId);
        setMergeCap("Match computed · entering");
        navigate("/match?job=" + encodeURIComponent(targetJobId) + "&fresh=1");
      } catch (e) {
        setHintOverride(aiMessage(e));
        setMatching(false);
        setMergeGo(false);
      }
      return;
    }
    if (state !== "ready") return;

    // 访客可免费跑一次简历分析，额度耗尽由服务端提示登录。


    const file = fileRef.current || (await loadFile("resume"));
    if (!file) {
      setHintOverride("请重新选择简历文件");
      setStateVal("empty");
      return;
    }
    fileRef.current = file;

    setStateVal("analysing");
    setHintOverride(null);
    // Runs in the module-level registry so navigating away cannot abort it.
    startTask<ResumeResult>("resume", () => parseResume(file, targetJobId ?? undefined));
  }

  const map = STATE_MAP[state];
  const hintLine = hintOverride ?? map.hint;

  const Shell = (embedded ? "div" : "main") as "main";

  return (
    <div className="p-profile">
      <Shell className={embedded ? "wb-shell" : "page"}>
        {!embedded && <TopBar />}

        <section
          className={"layout" + (embedded ? " wb" : "") + (dragging ? " dragging" : "")}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => {
            e.preventDefault();
            // Only clear when the pointer really leaves the panel, not on child hops.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(false);
            handle(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
          }}
        >
          <aside className="side">
            <div className="caption">{embedded ? "B · Candidate Profile" : "02 · Candidate Profile"}</div>
            <h1>
              创建属于你的
              <br />
              能力花
            </h1>
            <p>把简历翻译成能力证据——哪些能力你写清楚了，哪些只是提了一句没有佐证，一眼就知道该补什么。</p>

            <div className="steps" hidden={embedded}>
              <div className={"step" + (state === "empty" ? " on" : "")} id="s1">
                <span className="n">01</span> 上传简历
              </div>
              <div className={"step" + (state === "ready" || state === "analysing" ? " on" : "")} id="s2">
                <span className="n">02</span> 建立画像
              </div>
              <div className={"step" + (state === "bloomed" ? " on" : "")} id="s3">
                <span className="n">03</span> 进入匹配
              </div>
            </div>

            <div className="actions" hidden={embedded}>
              <button className="btn ghost" id="backBtn" onClick={onBack}>
                ← 返回
              </button>
            </div>


            <div style={{ marginTop: "auto" }} hidden={embedded}>
              <div className="caption" style={{ marginBottom: 10 }}>
                Parser
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

          <section className="stage" ref={stageRef}>
            <div className="stage-head">
              <span className="caption">Ability Flower · 8 competencies</span>
              {state === "bloomed" && result ? (
                <ExportMenu
                  fileBase={`Profile-${rName.replace(/\.[^.]+$/, "")}`}
                  captureRef={stageRef}
                  buildDoc={() => ({
                    title: "候选人画像 · 8 维能力",
                    subtitle: `${rName} · ${rMeta}`,
                    sections: [
                      ...(keyPoints.length
                        ? [{ heading: "Key points · 最突出的 3 项能力", lines: keyPoints.map((p) => `${p.title} — ${p.detail}`) }]
                        : []),
                      ...DIMS.map((dim, i) => {
                      const d = (result[i] || {}) as DimResult;
                      const evi = (d.evidenceDetail ?? []).map(
                        (ev) =>
                          `· ${[ev.label, ev.role].filter(Boolean).join(" · ") || "简历原文"}${ev.claim ? "：" + ev.claim : ""}${
                            ev.quotes?.length ? " 「" + ev.quotes.join("」「") + "」" : ""
                          }`,
                      );
                      return {
                        heading: `${dim.label} · ${d.score == null ? "—" : d.score + "/5"}`,
                        lines: [
                          `Analysis: ${d.why || "—"}`,
                          `Evidence:${evi.length ? "" : " " + (d.evidence || "简历中未见相关证据")}`,
                          ...evi,
                        ],
                      };
                      }),
                    ],
                  })}


                />
              ) : (
                <span className="mode" id="stateTag">
                  {map.tag}
                </span>
              )}
            </div>

            <div
              className={"petal-stage" + (blooming ? " blooming" : "") + (bloomedClass ? " bloomed" : "")}
              id="petalStage"
              data-state={state}
            >
              <div
                className={"visual" + (dragging ? " dragging" : "")}
                id="visual"
                ref={visualRef}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handle(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
                }}
              >
                <svg className="flower-svg" id="flowerSvg" viewBox="112 200 506 344">
                  <g id="backPetals" ref={backRootRef}></g>
                  <g id="frontPetals" ref={frontRootRef}></g>
                  <g id="stamens" ref={stamenRootRef}></g>
                  <g id="stemLeaf"></g>
                  <g id="notes"></g>
                </svg>

                <div
                  className="rcard"
                  id="rcard"
                  onClick={() => {
                    if (state === "ready") {
                      if (inputRef.current) inputRef.current.value = "";
                      inputRef.current?.click();
                    }
                  }}
                >
                  <div className="rname" id="rName">
                    {rName}
                  </div>
                  <div className="rtag">[R]</div>
                  <div className="lines" id="rLines">
                    {RLINE_WIDTHS.map((w, i) => (
                      <i key={i} style={{ width: w + "%" }}></i>
                    ))}
                  </div>
                  <div className="rmeta">
                    <span id="rMeta">{rMeta}</span>
                    <span>CV</span>
                  </div>

                  <div className="scan"></div>
                </div>

                <div className={"tip" + (tip.on ? " on" : "")} id="tip" style={{ left: tip.x, top: tip.y }}>
                  <h5>
                    <span id="tipName">{tip.name}</span>
                    <b id="tipScore">{tip.score}</b>
                  </h5>
                  <div className="row">
                    <div className="k">Analysis</div>
                    <div className="v" id="tipWhy">
                      {tip.why}
                    </div>
                  </div>
                  <div className="row">
                    <div className="k">Evidence</div>
                    <div className="v" id="tipEvi">
                      {tip.evi}
                    </div>
                  </div>

                </div>
              </div>

              <div className={"state-line" + (state === "empty" ? " script" : "")} id="stateLine">
                {map.line}
              </div>

              <div className="stage-actions">
                <div className="btnrow">
                  <button className="btn ghost" id="redoBtn" hidden={state !== "bloomed"} onClick={onRedo}>
                    重新建立画像
                  </button>
                  <button
                    className={"btn" + (state === "analysing" ? " loading" : "")}
                    id="mainBtn"
                    hidden={embedded && state === "bloomed"}
                    onClick={onMainBtn}
                  >
                    {state === "analysing" ? (
                      <>
                        分析中<span className="dot"></span><span className="dot"></span><span className="dot"></span>
                      </>
                    ) : (
                      map.btn
                    )}
                  </button>
                </div>
                <span className="hintline" id="hintLine">
                  {hintLine}
                  {!user && (
                    <>
                      {hintLine ? " · " : ""}
                      <Link to={`/auth?next=${encodeURIComponent("/workbench" + (targetJobId ? `?job=${targetJobId}` : ""))}`} style={{ textDecoration: "underline" }}>
                        去登录 →
                      </Link>
                    </>

                  )}
                </span>

                <input
                  ref={inputRef}
                  id="cvFile"
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  hidden
                  onChange={(e) => handle(e.target.files && e.target.files[0])}
                />
              </div>

              <div className="legend" id="legend">
                {result && keyPoints.length > 0 && (
                  <div className="g fade kp">
                    <h4>00 · Key points · 这份简历最突出的 3 项能力</h4>
                    {keyPoints.map((p, n) => (
                      <div className="kp-i" key={p.title + n}>
                        <span className="k">{String(n + 1).padStart(2, "0")}</span>
                        <div>
                          <div className="kp-t">{p.title}</div>
                          <div className="kp-d">{p.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {result &&
                  GROUPS.map((g, i) => (
                    <div className="g fade" key={g.title} style={{ animationDelay: i * 0.12 + "s" }}>
                      <h4>{g.title}</h4>
                      {g.idx.map((k) => {
                        const d = result[k] || ({} as DimResult);
                        const s = d.score;
                        return (
                          <div className="p" key={k}>
                            <div className="ph">
                              <span>
                                {DIMS[k].label}
                                <em>{DIMS[k].key}</em>
                              </span>
                              <b>{s == null ? "—" : s}/5</b>
                            </div>
                            <div className={"bar" + (s == null ? " none" : "")}>
                              {Array.from({ length: 5 }, (_, n) => (
                                <i key={n} className={s != null && n < s ? "on" : ""}></i>
                              ))}
                            </div>
                            <dl>
                              <div className="r">
                                <span className="k">Analysis</span>
                                <span className="v">{d.why || "—"}</span>
                              </div>
                              <div className="r">
                                <span className="k">Evidence</span>
                                <span className="v">
                                  {d.evidenceDetail && d.evidenceDetail.length > 0 ? (
                                    <span className="evi">
                                      {d.evidenceDetail.map((ev, n) => (
                                        <span className="evi-i" key={ev.label + n}>
                                          <span className="evi-m">
                                            {[ev.label, ev.role].filter(Boolean).join(" · ") || "简历原文"}
                                          </span>
                                          {ev.claim && <span className="evi-r">{ev.claim}</span>}
                                          {(ev.quotes || []).map((q, qi) => (
                                            <span className="evi-q" key={qi}>「{q}」</span>
                                          ))}
                                        </span>
                                      ))}
                                    </span>
                                  ) : (
                                    d.evidence || "简历中未见相关证据"
                                  )}
                                </span>
                              </div>
                            </dl>

                            <div className="str">[{(d.strength || "missing").toUpperCase()}]</div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            </div>
          </section>
        </section>

        <div className={"merge" + (matching ? " on" : "") + (mergeGo ? " go" : "")} id="merge">
          <div className="arena">
            <div className="mine" id="mergeMine" dangerouslySetInnerHTML={{ __html: mergeSvg }} />
            <div className="role" id="mergeRole" dangerouslySetInnerHTML={{ __html: mergeSvg }} />
          </div>
          <div className="caps"><span className="cap">Your flower</span><span className="cap">Role flower</span></div>
          <div className="cap" id="mergeCap">{mergeCap}</div>
        </div>




        <div className={"mask" + (dialog ? " on" : "")} id="mask" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
          <div className="dlg">
            <h5 id="dlgTitle">{dialog?.title}</h5>
            <p id="dlgBody">{dialog?.body}</p>
            <div className="row">
              <button className="btn ghost" id="dlgCancel" onClick={closeDialog}>
                取消
              </button>
              <button
                className="btn"
                id="dlgOk"
                onClick={() => {
                  const cb = dialog?.onConfirm;
                  closeDialog();
                  if (cb) cb();
                }}
              >
                {dialog?.okText}
              </button>
            </div>
          </div>
        </div>
      </Shell>
    </div>
  );
}
