import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import l0 from "@/assets/home/l0.png.asset.json";
import l1 from "@/assets/home/l1.png.asset.json";
import l2 from "@/assets/home/l2.png.asset.json";
import l3 from "@/assets/home/l3.png.asset.json";
import l4 from "@/assets/home/l4.png.asset.json";
import l5 from "@/assets/home/l5.png.asset.json";
import l6 from "@/assets/home/l6.png.asset.json";
import l7 from "@/assets/home/l7.png.asset.json";
import l8 from "@/assets/home/l8.png.asset.json";
import l9 from "@/assets/home/l9.png.asset.json";
import l10 from "@/assets/home/l10.png.asset.json";
import flower from "@/assets/home/flower.png.asset.json";
import "@/styles/pages/home.css";

const WORDS = [
  [{ a: l0, c: "W" }, { a: l1, c: "o" }, { a: l2, c: "r" }, { a: l3, c: "k" }],
  [{ a: l4, c: "f" }, { a: l5, c: "i" }, { a: l6, c: "n" }, { a: l7, c: "d" }],
  [{ a: l8, c: "Y" }, { a: l9, c: "O" }, { a: l10, c: "U" }],
];

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
export function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] || "th";
}

function Letter({ src, ch }: { src: string; ch: string }) {
  const [on, setOn] = useState(false);
  return (
    <img
      src={src}
      alt=""
      className={"hl" + (on ? " wiggle" : "")}
      data-ch={ch}
      onMouseEnter={() => setOn(true)}
      onAnimationEnd={() => setOn(false)}
      draggable={false}
    />
  );
}

export default function Home() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const d = now.getDate();

  return (
    <div className="p-home p-home-hand">
      <main className="page">
        <TopBar />
      </main>
      <section className="hand-hero">
        <h1 className="hand-title" aria-label="Work find YOU">
          {WORDS.map((w, i) => (
            <span key={i} className="hw">
              {w.map((l, k) => <Letter key={k} src={l.a.url} ch={l.c} />)}
            </span>
          ))}
        </h1>
        <div className="hand-date">
          <div>{DAYS[now.getDay()]}</div>
          <div>{d}<sup>{ordinal(d)}</sup> {MONTHS[now.getMonth()]}</div>
        </div>
        <img className="hand-flower" src={flower.url} alt="" draggable={false} />
        <Link className="hand-cta" to="/workbench">START</Link>
      </section>
    </div>
  );
}
