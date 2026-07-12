import { useState } from "react";

const PAGES = [
  { key: "index", label: "总览", src: "/previews/index.html" },
  { key: "home", label: "首页 A", src: "/previews/home.html" },
  { key: "profile", label: "画像 A", src: "/previews/profile.html" },
  { key: "match", label: "匹配 B", src: "/previews/match.html" },
  { key: "compare", label: "对比 A", src: "/previews/compare.html" },
  { key: "delivery", label: "投递 C", src: "/previews/delivery.html" },
];

const Index = () => {
  const [active, setActive] = useState(PAGES[0]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#F1F1F1", fontFamily: "Inter, sans-serif" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "10px 16px",
          borderBottom: "0.5px solid #D4D4D4",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#404040",
          flexWrap: "wrap",
        }}
      >
        <span style={{ marginRight: 16, color: "#0A0A0A", fontWeight: 500 }}>PREVIEW</span>
        {PAGES.map((p) => {
          const on = p.key === active.key;
          return (
            <button
              key={p.key}
              onClick={() => setActive(p)}
              style={{
                padding: "6px 12px",
                border: "0.5px solid " + (on ? "#0A0A0A" : "#D4D4D4"),
                background: on ? "#0A0A0A" : "transparent",
                color: on ? "#F1F1F1" : "#404040",
                cursor: "pointer",
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {p.label}
            </button>
          );
        })}
        <a
          href={active.src}
          target="_blank"
          rel="noreferrer"
          style={{ marginLeft: "auto", color: "#404040", textDecoration: "underline", fontSize: 11 }}
        >
          新窗口打开 ↗
        </a>
      </div>
      <iframe
        key={active.key}
        src={active.src}
        title={active.label}
        style={{ flex: 1, width: "100%", border: 0, background: "#F1F1F1" }}
      />
    </div>
  );
};

export default Index;
