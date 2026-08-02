import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import { getUI, setUI } from "@/lib/wfy";
import "@/styles/pages/jobprofile.css";

export default function JobProfile() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

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

    const C = [355, 372];
    const FRONT = [
      [[352,366],[297,270],[350,230],[415,235],[410,300],[392,322]],
      [[332,362],[297,272],[255,287],[247,365],[276,368]],
      [[268,360],[252,410],[280,437],[315,460],[341,434],[350,392]],
      [[352,386],[356,421],[371,481],[415,486],[436,459],[461,435],[416,406]],
      [[364,364],[395,320],[440,290],[477,307],[472,337],[505,350],[495,395],[460,427],[416,406]],
    ];
    const BACK = [
      [[408,300],[430,254],[463,250],[474,292],[452,308]],
      [[262,356],[226,349],[214,386],[247,403],[270,384]],
      [[441,430],[473,455],[464,492],[426,489],[417,462]],
    ];

    const SVGNS = "http://www.w3.org/2000/svg";
    const frontRoot = root.querySelector("#frontPetals") as SVGGElement;
    const backRoot = root.querySelector("#backPetals") as SVGGElement;
    const stamenRoot = root.querySelector("#stamens") as SVGGElement;
    const stemRoot = root.querySelector("#stemLeaf") as SVGGElement;
    const notesRoot = root.querySelector("#notes") as SVGGElement;
    const stageEl = root.querySelector("#petalStage") as HTMLElement;
    const visual = root.querySelector("#visual") as HTMLElement;
    const stateTag = root.querySelector("#stateTag") as HTMLElement;
    const stateLine = root.querySelector("#stateLine") as HTMLElement;
    const tip = root.querySelector("#tip") as HTMLElement;

    function rng(seed: number) {
      let t = seed >>> 0;
      return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    }

    function spline(pts: number[][]) {
      const n = pts.length;
      const d = [`M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`];
      for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d.push(`C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`);
      }
      return d.join(" ") + " Z";
    }

    function shape(base: number[][], score: number | null, seed: number) {
      const s = score == null ? 1.2 : score;
      const f = 0.87 + s * 0.052;
      const r = rng(seed * 7919 + 13);
      return base.map((p) => {
        const dx = p[0] - C[0], dy = p[1] - C[1];
        const dist = Math.hypot(dx, dy);
        const near = Math.min(1, dist / 60);
        const ff = 1 + (f - 1) * near;
        const j = (r() - 0.5) * 5 * near;
        const jj = (r() - 0.5) * 5 * near;
        return [C[0] + dx * ff + j, C[1] + dy * ff + jj];
      });
    }

    type Ref = { g: SVGGElement; p: SVGPathElement; base: number[][]; index: number; dim: typeof DIMS[number]; delay: number };
    const refs: Ref[] = [];

    function showTip(e: MouseEvent, ref: Ref) {
      if (stageEl.dataset.state !== "bloomed" && stageEl.dataset.state !== "empty") return;
      const d: any = current[ref.index] || {};
      (root!.querySelector("#tipName") as HTMLElement).textContent = ref.dim.label;
      (root!.querySelector("#tipScore") as HTMLElement).textContent = d.evidence ? (d.score == null ? "证据不足" : d.score + "/5") : "—";
      (root!.querySelector("#tipEvi") as HTMLElement).textContent = d.evidence || "尚未建立画像";
      (root!.querySelector("#tipWhy") as HTMLElement).textContent = d.why || "上传简历后生成";
      (root!.querySelector("#tipAct") as HTMLElement).textContent = d.action || "—";
      const box = visual.getBoundingClientRect();
      let x = e.clientX - box.left + 18, y = e.clientY - box.top + 12;
      x = Math.min(x, box.width - 262); y = Math.min(y, box.height - 180);
      tip.style.left = Math.max(0, x) + "px";
      tip.style.top = Math.max(0, y) + "px";
      tip.classList.add("on");
    }

    function makePetal(rootEl: SVGGElement, base: number[][], index: number, delay: number) {
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "petal-g");
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("class", "petal grow");
      p.setAttribute("d", spline(shape(base, 2.5, index)));
      g.appendChild(p);
      rootEl.appendChild(p.parentElement ? g : g);
      const ref: Ref = { g, p, base, index, dim: DIMS[index], delay };
      refs[index] = ref;
      g.addEventListener("mousemove", (e) => showTip(e, ref));
      g.addEventListener("mouseleave", () => tip.classList.remove("on"));
      g.addEventListener("click", (e) => showTip(e, ref));
      return ref;
    }
    BACK.forEach((b, i) => makePetal(backRoot, b, 5 + i, 0.05 * i));
    FRONT.forEach((b, i) => makePetal(frontRoot, b, i, 0.18 + 0.11 * i));

    [
      "M 352 384 C 348 372 342 362 336 356", "M 336 356 c -3 -2 -6 0 -5 3 c 1 3 5 3 6 0",
      "M 350 382 C 344 378 334 376 326 378", "M 326 378 c -4 1 -5 4 -2 6 c 3 2 6 -1 5 -4",
      "M 354 380 C 356 368 356 358 354 348", "M 354 348 c -1 -3 2 -5 4 -3 c 2 2 1 5 -2 5",
      "M 357 381 C 362 372 370 365 379 361", "M 379 361 c 3 -1 5 1 4 4 c -2 3 -6 2 -6 -1",
      "M 358 384 C 366 381 375 381 383 383", "M 383 383 c 3 1 3 4 0 5 c -3 1 -6 -2 -4 -4",
      "M 349 388 C 340 389 331 393 325 399", "M 325 399 c -2 2 -1 5 2 5 c 3 0 5 -3 3 -5",
    ].forEach((d) => {
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("class", "stamen");
      p.setAttribute("d", d);
      stamenRoot.appendChild(p);
    });
    stemRoot.innerHTML = "";

    let current: any[] = DIMS.map(() => ({ score: null }));

    function paint(data: any[], animate: boolean) {
      current = data;
      refs.forEach((r, i) => {
        const d = data[i] || {};
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
      if (animate) {
        stemRoot.querySelectorAll("path").forEach((p, i) => {
          p.style.setProperty("--len", String(p.getTotalLength()));
          p.style.animationDelay = 0.9 + i * 0.2 + "s";
        });
      } else {
        stemRoot.querySelectorAll("path").forEach((p) => {
          p.style.removeProperty("--len");
          p.style.removeProperty("animation-delay");
        });
      }

      notesRoot.innerHTML = "";
    }
    paint(DIMS.map((_, i) => ({ score: 2.5, seed: i })), false);

    // ============ upload → build → bloom ============
    const input = root.querySelector("#cvFile") as HTMLInputElement;
    const mainBtn = root.querySelector("#mainBtn") as HTMLButtonElement;
    const redoBtn = root.querySelector("#redoBtn") as HTMLButtonElement;
    const backBtn = root.querySelector("#backBtn") as HTMLButtonElement;
    const rcard = root.querySelector("#rcard") as HTMLElement;
    const mask = root.querySelector("#mask") as HTMLElement;
    const dlgTitle = root.querySelector("#dlgTitle") as HTMLElement;
    const dlgBody = root.querySelector("#dlgBody") as HTMLElement;
    const dlgOk = root.querySelector("#dlgOk") as HTMLButtonElement;
    const dlgCancel = root.querySelector("#dlgCancel") as HTMLButtonElement;
    const hintLine = root.querySelector("#hintLine") as HTMLElement;
    const legend = root.querySelector("#legend") as HTMLElement;
    const rName = root.querySelector("#rName") as HTMLElement;
    const rMeta = root.querySelector("#rMeta") as HTMLElement;
    const rLines = root.querySelector("#rLines") as HTMLElement;
    const accept = /\.(pdf|docx?|png|jpe?g|webp|gif|bmp|heic|tiff?)$/i;
    let state = "empty";

    function loadStore(): any { const v = getUI<any>("jobprofile"); return v && v.state ? v : null; }
    function saveStore(v: any) { setUI("jobprofile", v || {}); }

    rLines.innerHTML = [100, 92, 78, 96, 64, 88, 100, 72, 90, 58, 96, 84, 70, 92]
      .map((w) => `<i style="width:${w}%"></i>`).join("");

    function setState(next: string) {
      state = next;
      stageEl.dataset.state = next;
      const map: Record<string, string[]> = {
        empty: ["STATE / EMPTY", "Let your flower bloom", "上传 JD", "click or drag · PDF / Word / Image"],
        ready: ["STATE / READY", "JD READY · WAITING TO BLOOM", "建立岗位画像", ""],
        analysing: ["STATE / LOADING", "ANALYSING…", "分析中", "PARSING · EXTRACTING · SCORING"],
        bloomed: ["STATE / SUCCESS · 1 LOW-CONFIDENCE", "THE ROLE FLOWER HAS BLOOMED", "进入匹配 →", "hover 花瓣查看岗位要求与权重理由"],
      };
      const m = map[next];
      stateTag.textContent = m[0];
      stateLine.textContent = m[1];
      stateLine.classList.toggle("script", next === "empty");
      mainBtn.textContent = m[2];
      hintLine.textContent = m[3];
      mainBtn.classList.toggle("loading", next === "analysing");
      if (next === "analysing") mainBtn.innerHTML = '分析中<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
      redoBtn.hidden = next !== "bloomed";
      (root!.querySelector("#s1") as HTMLElement).classList.toggle("on", next === "empty");
      (root!.querySelector("#s2") as HTMLElement).classList.toggle("on", next === "ready" || next === "analysing");
      (root!.querySelector("#s3") as HTMLElement).classList.toggle("on", next === "bloomed");
    }

    function handle(file: File | null | undefined) {
      if (!file) return;
      if (!accept.test(file.name)) { hintLine.textContent = "UNSUPPORTED · PDF / WORD / IMAGE ONLY"; return; }
      if (file.size > 10 * 1024 * 1024) { hintLine.textContent = "FILE TOO LARGE · MAX 10MB"; return; }
      const kb = file.size / 1024;
      rName.textContent = file.name;
      rMeta.textContent = (file.name.split(".").pop() || "FILE").toUpperCase() + " · " +
        (kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : Math.round(kb) + " KB");
      legend.innerHTML = "";
      setState("ready");
      saveStore({ state: "ready", name: rName.textContent, meta: rMeta.textContent });
    }

    const onInputChange = (e: Event) => handle((e.target as HTMLInputElement).files?.[0]);
    input.addEventListener("change", onInputChange);

    const dragOn = (e: DragEvent) => { e.preventDefault(); visual.classList.add("dragging"); };
    const dragOff = (e: DragEvent) => { e.preventDefault(); visual.classList.remove("dragging"); };
    ["dragenter", "dragover"].forEach((ev) => visual.addEventListener(ev, dragOn as EventListener));
    ["dragleave", "drop"].forEach((ev) => visual.addEventListener(ev, dragOff as EventListener));
    const onDrop = (e: DragEvent) => handle(e.dataTransfer?.files?.[0]);
    visual.addEventListener("drop", onDrop as EventListener);
    const winDragOver = (e: DragEvent) => e.preventDefault();
    const winDrop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) handle(f);
    };
    window.addEventListener("dragover", winDragOver);
    window.addEventListener("drop", winDrop);

    const onCardClick = () => { if (state === "ready") { input.value = ""; input.click(); } };
    rcard.addEventListener("click", onCardClick);

    function reset() {
      stageEl.classList.remove("blooming", "bloomed");
      legend.innerHTML = "";
      input.value = "";
      paint(DIMS.map((_, i) => ({ score: 2.5, seed: i })), false);
      setState("empty");
      saveStore(null);
    }

    let onConfirm: (() => void) | null = null;
    function confirmDialog(title: string, body: string, okText: string, cb: () => void) {
      dlgTitle.textContent = title; dlgBody.textContent = body; dlgOk.textContent = okText;
      onConfirm = cb; mask.classList.add("on");
    }
    function closeDialog() { mask.classList.remove("on"); onConfirm = null; }
    dlgCancel.addEventListener("click", closeDialog);
    const onMaskClick = (e: MouseEvent) => { if (e.target === mask) closeDialog(); };
    mask.addEventListener("click", onMaskClick);
    const onKeydown = (e: KeyboardEvent) => { if (e.key === "Escape") closeDialog(); };
    document.addEventListener("keydown", onKeydown);
    const onDlgOk = () => { const cb = onConfirm; closeDialog(); if (cb) cb(); };
    dlgOk.addEventListener("click", onDlgOk);

    const onBack = () => {
      if (state === "bloomed" || state === "analysing") {
        confirmDialog("Discard job profile?", "返回将清空当前 JD 与已生成的岗位能力花，是否继续？", "确认返回", () => history.back());
      } else history.back();
    };
    backBtn.addEventListener("click", onBack);

    const onRedo = () => {
      confirmDialog("Rebuild job profile?", "重新建立岗位画像将清空当前结果，需要重新上传 JD，是否继续？", "确认重建", () => {
        reset();
        input.click();
      });
    };
    redoBtn.addEventListener("click", onRedo);

    function renderPetalAnalysis(result: any[]) {
      const groups = [
        { title: "01 · Can do · 能不能做", idx: [0, 1, 2] },
        { title: "02 · Can deliver · 能不能做成", idx: [3, 4, 5] },
        { title: "03 · Long-term fit · 能不能长期适配", idx: [6, 7] },
      ];
      legend.innerHTML = "";
      groups.forEach((g, i) => {
        const div = document.createElement("div");
        div.className = "g fade";
        div.style.animationDelay = (i * 0.12) + "s";
        div.innerHTML = "<h4>" + g.title + "</h4>" + g.idx.map((k) => {
          const d = result[k] || {};
          const s = d.score;
          const bar = Array.from({ length: 5 }, (_, n) => `<i class="${s != null && n < s ? "on" : ""}"></i>`).join("");
          return `<div class="p">
            <div class="ph"><span>${DIMS[k].label}<em>${DIMS[k].key}</em></span><b>${s == null ? "—" : s}/5</b></div>
            <div class="bar ${s == null ? "none" : ""}">${bar}</div>
            <dl>
              <div class="r"><span class="k">Evidence</span><span class="v">${d.evidence || "—"}</span></div>
              <div class="r"><span class="k">Why</span><span class="v">${d.why || "—"}</span></div>
              <div class="r"><span class="k">Action</span><span class="v">${d.action || "—"}</span></div>
            </dl>
            <div class="str">[${(d.strength || "missing").toUpperCase()}]</div>
          </div>`;
        }).join("");
        legend.appendChild(div);
      });
    }

    let analyseTimer: ReturnType<typeof setTimeout> | null = null;
    let mergeTimers: ReturnType<typeof setTimeout>[] = [];

    const onMain = () => {
      if (state === "empty") { input.click(); return; }
      if (state === "bloomed") {
        const svg = root!.querySelector("#flowerSvg") as SVGSVGElement;
        const m = root!.querySelector("#merge") as HTMLElement;
        (root!.querySelector("#mergeMine") as HTMLElement).innerHTML = svg.outerHTML;
        (root!.querySelector("#mergeRole") as HTMLElement).innerHTML = svg.outerHTML;
        m.classList.add("on");
        requestAnimationFrame(() => setTimeout(() => m.classList.add("go"), 60));
        mergeTimers.push(setTimeout(() => { (root!.querySelector("#mergeCap") as HTMLElement).textContent = "Match computed · entering"; }, 1250));
        mergeTimers.push(setTimeout(() => { navigate("/match"); }, 1900));
        return;
      }
      if (state !== "ready") return;

      setState("analysing");
      analyseTimer = setTimeout(() => {
        const result = [
          { score: 4, strength: "strong", evidence: "简历中 3 段 SQL / Figma 主导项目", why: "工具链与交付物均可验证", action: "补一段量化结果", note: "项目证据强" },
          { score: 3, strength: "medium", evidence: "描述过 GMV / 留存指标", why: "有指标意识但缺业务推演", action: "补充业务判断过程" },
          { score: 4, strength: "strong", evidence: "两次 A/B 实验设计与结论", why: "能用数据支撑判断", action: "写清取舍逻辑" },
          { score: 5, strength: "strong", evidence: "连续 4 个季度按时交付", why: "长期交付记录完整", action: "作为主线故事", note: "可作主线故事" },
          { score: 3, strength: "medium", evidence: "有对上汇报与文档记录", why: "书面强、口头证据少", action: "准备 STAR 口述" },
          { score: 2, strength: "weak", evidence: "跨团队协作描述较少", why: "缺少推动他人的具体案例", action: "补一段跨团队案例", note: "需补跨团队" },
          { score: 4, strength: "strong", evidence: "半年内切换两个新领域", why: "上手速度有实证", action: "保持并写清方法", note: "上手快" },
          { score: null, strength: "missing", evidence: "未填写偏好与求职动机", why: "无证据，不计分", action: "填写偏好备注", note: "证据不足" },
        ];
        paint(result, true);
        stageEl.classList.add("blooming");
        setState("bloomed");
        stageEl.classList.add("bloomed");
        renderPetalAnalysis(result);
        saveStore({ state: "bloomed", name: rName.textContent, meta: rMeta.textContent, result: result });
      }, 2600);
    };
    mainBtn.addEventListener("click", onMain);

    // ---- restore ----
    (function restore() {
      const saved = loadStore();
      if (!saved) { setState("empty"); return; }
      if (saved.name) { rName.textContent = saved.name; rMeta.textContent = saved.meta || ""; }
      if (saved.state === "bloomed" && saved.result) {
        paint(saved.result, false);
        stageEl.classList.add("bloomed");
        setState("bloomed");
        renderPetalAnalysis(saved.result);
      } else if (saved.state === "ready") {
        setState("ready");
      } else {
        setState("empty");
      }
    })();

    return () => {
      input.removeEventListener("change", onInputChange);
      ["dragenter", "dragover"].forEach((ev) => visual.removeEventListener(ev, dragOn as EventListener));
      ["dragleave", "drop"].forEach((ev) => visual.removeEventListener(ev, dragOff as EventListener));
      visual.removeEventListener("drop", onDrop as EventListener);
      window.removeEventListener("dragover", winDragOver);
      window.removeEventListener("drop", winDrop);
      rcard.removeEventListener("click", onCardClick);
      dlgCancel.removeEventListener("click", closeDialog);
      mask.removeEventListener("click", onMaskClick);
      document.removeEventListener("keydown", onKeydown);
      dlgOk.removeEventListener("click", onDlgOk);
      backBtn.removeEventListener("click", onBack);
      redoBtn.removeEventListener("click", onRedo);
      mainBtn.removeEventListener("click", onMain);
      if (analyseTimer) clearTimeout(analyseTimer);
      mergeTimers.forEach((t) => clearTimeout(t));
    };
  }, [navigate]);

  return (
    <div className="p-jobprofile">
      <div ref={rootRef}>
        <main className="page">
          <TopBar />

          <section className="layout">
            <aside className="side">
              <div className="caption">03 · Job Profile</div>
              <h1>解析岗位的<br />理想能力花</h1>
              <p>上传岗位 JD，8 项胜任力维度将生长为这个岗位的理想能力花。花瓣越舒展代表该岗位越看重这项能力；JD 未提及时只开虚线小瓣，不记 0 分。</p>

              <div className="steps">
                <div className="step on" id="s1"><span className="n">01</span> 上传 JD</div>
                <div className="step" id="s2"><span className="n">02</span> 建立岗位画像</div>
                <div className="step" id="s3"><span className="n">03</span> 进入匹配</div>
              </div>

              <div className="actions">
                <button className="btn ghost" id="backBtn">← 返回</button>
              </div>

              <div style={{ marginTop: "auto" }}>
                <div className="caption" style={{ marginBottom: 10 }}>Parser</div>
                <div className="moon"><i></i><i></i><i></i><i></i><i></i></div>
              </div>
            </aside>

            <section className="stage">
              <div className="stage-head">
                <span className="caption">Role Ability Flower · 8 competencies</span>
                <span className="mode" id="stateTag">STATE / EMPTY</span>
              </div>

              <div className="petal-stage" id="petalStage" data-state="empty">
                <div className="visual" id="visual">
                  <svg className="flower-svg" id="flowerSvg" viewBox="112 200 506 344">
                    <g id="backPetals"></g>
                    <g id="frontPetals"></g>
                    <g id="stamens"></g>
                    <g id="stemLeaf"></g>
                    <g id="notes"></g>
                  </svg>

                  <div className="rcard" id="rcard">
                    <div className="rname" id="rName">jd.png</div>
                    <div className="rtag">[R]</div>
                    <div className="lines" id="rLines"></div>
                    <div className="rmeta"><span id="rMeta">PNG · 480 KB</span><span>JD</span></div>

                    <div className="scan"></div>
                  </div>

                  <div className="tip" id="tip">
                    <h5><span id="tipName"></span><b id="tipScore"></b></h5>
                    <div className="row"><div className="k">Evidence</div><div className="v" id="tipEvi"></div></div>
                    <div className="row"><div className="k">Why this score</div><div className="v" id="tipWhy"></div></div>
                    <div className="row"><div className="k">Action</div><div className="v" id="tipAct"></div></div>
                  </div>
                </div>

                <div className="state-line" id="stateLine">LET YOUR FLOWER BLOOM</div>

                <div className="stage-actions">
                  <div className="btnrow">
                    <button className="btn ghost" id="redoBtn" hidden>重新建立岗位画像</button>
                    <button className="btn" id="mainBtn">上传简历</button>
                  </div>
                  <span className="hintline" id="hintLine">click or drag · PDF / Word / Image</span>
                  <input id="cvFile" type="file" accept=".pdf,.doc,.docx,image/*" hidden />
                </div>

                <div className="legend" id="legend"></div>
              </div>
            </section>
          </section>
        </main>

        <div className="mask" id="mask">
          <div className="dlg">
            <h5 id="dlgTitle">Discard profile?</h5>
            <p id="dlgBody">返回将清空当前简历与已生成的能力花，是否继续？</p>
            <div className="row">
              <button className="btn ghost" id="dlgCancel">取消</button>
              <button className="btn" id="dlgOk">确认返回</button>
            </div>
          </div>
        </div>

        <div className="merge" id="merge">
          <div className="arena">
            <div className="mine" id="mergeMine"></div>
            <div className="role" id="mergeRole"></div>
          </div>
          <div className="caps"><span className="cap">Your flower</span><span className="cap">Role flower</span></div>
          <div className="cap" id="mergeCap">Overlaying two flowers · computing fit</div>
        </div>
      </div>
    </div>
  );
}
