import { Link } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import "@/styles/pages/home.css";

const MARQUEE =
  "平均决策时间 ↓ 62%   ·   匹配维度 24   ·   已聚合岗位 12,480   ·   月相 loading 已就绪   ·   Swiss Grid v0.1   ·   ";

const TRIO = [
  { num: "01", h: "建立你的画像", p: "上传简历或手动填写，10 花瓣能力模型即刻成形，作为后续所有匹配的坐标系。" },
  { num: "02", h: "匹配一份岗位", p: "贝塞尔连线直观呈现候选人与岗位之间的匹配点、风险点、可迁移能力。" },
  { num: "03", h: "对比、投递、复盘", p: "轨道池横向对比、时间线日志式追踪投递状态，形成可复用的决策闭环。" },
];

const TICKS = [
  { num: "01", label: "HOME / 首页", angle: 0 },
  { num: "02", label: "WORKBENCH", angle: -40 },
  { num: "03", label: "MATCH", angle: 40 },
  { num: "04", label: "COMPARE", angle: -80 },
  { num: "05", label: "DELIVERY", angle: 80 },
];

export default function Home() {
  return (
    <div className="p-home">
      <main className="page">
        <TopBar />

        <section className="hero">
          <div className="l">
            <div>
              <div className="caption">01 · AI 求职决策工作台</div>
              <h1 style={{ marginTop: 24 }}>
                Work
                <br />
                Finds You.
              </h1>
              <div className="zh">选对方向，工作找你。</div>
              <div className="en-sub">Choose the direction, let the work come to you.</div>
              <p className="slogan">
                策略、选择有时比努力更重要，助力求职者在有限的投递机会中高效做出一个个明智的选择。
                <span className="en">
                  Strategy and choice sometimes matter more than effort — helping job seekers make smart decisions
                  within limited chances.
                </span>
              </p>
            </div>
            <div className="meta">
              <div>
                <div className="caption">Loading</div>
                <div className="moon" style={{ marginTop: 10 }}>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="caption">Version</div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 12,
                    marginTop: 6,
                  }}
                >
                  v0.1 · SWISS
                </div>
              </div>
            </div>
          </div>

          <div className="dial-wrap">
            <div className="dial">
              <svg viewBox="0 0 560 560">
                <g className="dial-rotor">
                  <circle className="ring" cx="280" cy="280" r="256" />
                  <circle className="ring" cx="280" cy="280" r="200" />
                  <circle className="ring" cx="280" cy="280" r="140" />
                </g>

                {TICKS.map((t) => (
                  <g className="tick-group" key={t.num} transform={`rotate(${t.angle} 280 280)`}>
                    <line className="tickline" x1="280" y1="24" x2="280" y2="80" />
                    <text
                      className="tick-label"
                      x="280"
                      y="18"
                      textAnchor="middle"
                      transform={`rotate(${-t.angle} 280 18)`}
                    >
                      {t.num}
                    </text>
                    <circle className="tick-node" cx="280" cy="80" r="8" />
                    <text
                      className="tick-title"
                      x="280"
                      y="112"
                      textAnchor="middle"
                      transform={`rotate(${-t.angle} 280 112)`}
                    >
                      {t.label}
                    </text>
                  </g>
                ))}
              </svg>

              <Link className="cta" to="/workbench">
                <span className="t">开始分析</span>
                <span className="k">Start →</span>
              </Link>
            </div>
          </div>
        </section>

        <div className="marquee">
          <span>{MARQUEE}</span>
          <span>{MARQUEE}</span>
        </div>

        <section className="trio">
          {TRIO.map((t) => (
            <div key={t.num}>
              <span className="num">{t.num}</span>
              <h3>{t.h}</h3>
              <p>{t.p}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
