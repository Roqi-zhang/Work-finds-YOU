import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import "@/styles/pages/home.css";

/* Hand-drawn single-line flowers. Each petal is a slightly wobbly loop; bloom (0..1) draws them in. */
type Flower = { x: number; y: number; s: number; petals: number; rot: number; stem: string };

const FLOWERS: Flower[] = [
  { x: 12, y: 26, s: 1.1, petals: 6, rot: 10, stem: "c -6 40 8 80 -4 140" },
  { x: 86, y: 20, s: 0.8, petals: 5, rot: -20, stem: "c 8 30 -10 70 4 120" },
  { x: 8, y: 78, s: 0.9, petals: 7, rot: 30, stem: "c 4 30 -6 50 2 80" },
  { x: 90, y: 72, s: 1.25, petals: 6, rot: 0, stem: "c -8 40 6 70 -2 110" },
  { x: 30, y: 88, s: 0.6, petals: 5, rot: 45, stem: "c 3 20 -4 30 0 50" },
  { x: 70, y: 90, s: 0.7, petals: 8, rot: 15, stem: "c -3 20 5 30 0 50" },
  { x: 62, y: 12, s: 0.55, petals: 5, rot: -10, stem: "c 4 20 -4 40 2 60" },
];

function petalPath(i: number, n: number, r: number) {
  const a = (Math.PI * 2 * i) / n;
  const w = (Math.PI / n) * 0.9;
  const j = 1 + ((i * 37) % 7) / 40; // per-petal wobble
  const p = (ang: number, rad: number) => `${(Math.cos(ang) * rad).toFixed(1)} ${(Math.sin(ang) * rad).toFixed(1)}`;
  return `M ${p(a - w * 0.2, 6)} C ${p(a - w, r * 0.7 * j)} ${p(a - w * 0.4, r * j)} ${p(a, r * 1.02 * j)} C ${p(a + w * 0.5, r * 0.98)} ${p(a + w * 1.05, r * 0.6)} ${p(a + w * 0.15, 5)}`;
}

export default function Home() {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const groups = Array.from(wrap.querySelectorAll<SVGGElement>(".fl"));
    const cur: number[] = groups.map(() => (reduce ? 0.7 : 0.22));
    const tgt = cur.slice();
    groups.forEach((g, i) => g.style.setProperty("--b", String(cur[i])));
    if (reduce) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      groups.forEach((g, i) => {
        const r = g.getBoundingClientRect();
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        tgt[i] = Math.max(0.22, Math.min(1, 1 - (d - 60) / 320));
      });
    };
    const tick = () => {
      groups.forEach((g, i) => {
        const k = tgt[i] > cur[i] ? 0.08 : 0.025; // open quickly, close slowly
        cur[i] += (tgt[i] - cur[i]) * k;
        g.style.setProperty("--b", cur[i].toFixed(3));
      });
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="p-home p-home-bloom">
      <main className="page">
        <TopBar />
      </main>

      <div className="bloom-bg" ref={wrapRef} aria-hidden="true">
        {FLOWERS.map((f, fi) => (
          <svg
            key={fi}
            className="fl-svg"
            style={{ left: `${f.x}%`, top: `${f.y}%`, width: 220 * f.s, height: 360 * f.s }}
            viewBox="-110 -110 220 360"
          >
            <g className="fl">
              <path className="stem" d={`M 0 8 ${f.stem}`} pathLength={1} />
              <path className="leaf" d="M 0 70 c 18 -14 36 -10 42 -2 c -14 10 -30 12 -42 2" pathLength={1} />
              <g transform={`rotate(${f.rot})`}>
                {Array.from({ length: f.petals }).map((_, i) => (
                  <path
                    key={i}
                    className="petal"
                    d={petalPath(i, f.petals, 70)}
                    pathLength={1}
                    style={{ ["--d" as string]: i / f.petals }}
                  />
                ))}
              </g>
              <circle className="core" r="7" />
              <path className="core-scribble" d="M -4 -2 c 3 -4 7 0 4 3 c -3 3 -6 -1 -2 -3" />
            </g>
          </svg>
        ))}
      </div>

      <section className="bloom-hero">
        <h1 className="bloom-title">let yourself bloom!</h1>
        <Link className="bloom-cta" to="/workbench" aria-label="Start · 开始分析">
          <svg className="bloom-ring" viewBox="0 0 220 110" aria-hidden="true">
            <path d="M 30 58 C 28 20 190 12 196 52 C 202 92 40 104 22 66 C 12 44 60 26 120 24" pathLength={1} />
          </svg>
          <span>START</span>
        </Link>
        <div className="bloom-sub">选对方向，工作找你 · Choose the direction, let the work come to you.</div>
      </section>
    </div>
  );
}
