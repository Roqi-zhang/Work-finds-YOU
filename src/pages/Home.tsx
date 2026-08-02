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

export default function Home() {
  return (
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

              <g className="tick-group">
                <line className="tickline" x1="280" y1="24" x2="280" y2="80" />
                <text className="tick-label" x="280" y="18" textAnchor="middle">
                  01
                </text>
                <circle className="tick-node" cx="280" cy="80" r="8" />
                <text className="tick-title" x="280" y="112" textAnchor="middle">
                  CANDIDATE / 画像
                </text>
              </g>
              <g className="tick-group" transform="rotate(-40 280 280)">
                <line className="tickline" x1="280" y1="24" x2="280" y2="80" />
                <text className="tick-label" x="280" y="18" textAnchor="middle" transform="rotate(40 280 18)">
                  02
                </text>
                <circle className="tick-node" cx="280" cy="80" r="8" />
              </g>
              <g className="tick-group" transform="rotate(40 280 280)">
                <line className="tickline" x1="280" y1="24" x2="280" y2="80" />
                <circle className="tick-node" cx="280" cy="80" r="8" />
              </g>
              <g className="tick-group" transform="rotate(-80 280 280)">
                <line className="tickline" x1="280" y1="24" x2="280" y2="80" />
                <circle className="tick-node" cx="280" cy="80" r="8" />
              </g>
              <g className="tick-group" transform="rotate(80 280 280)">
                <line className="tickline" x1="280" y1="24" x2="280" y2="80" />
                <circle className="tick-node" cx="280" cy="80" r="8" />
              </g>

              <text className="tick-label" x="120" y="140" textAnchor="middle">02</text>
              <text className="tick-label" x="440" y="140" textAnchor="middle">03</text>
              <text className="tick-label" x="60" y="300" textAnchor="middle">04</text>
              <text className="tick-label" x="500" y="300" textAnchor="middle">05</text>

              <text className="tick-title" x="120" y="164" textAnchor="middle" style={{ fontSize: 12 }}>PROFILE</text>
              <text className="tick-title" x="440" y="164" textAnchor="middle" style={{ fontSize: 12 }}>MATCH</text>
              <text className="tick-title" x="60" y="324" textAnchor="middle" style={{ fontSize: 12 }}>COMPARE</text>
              <text className="tick-title" x="500" y="324" textAnchor="middle" style={{ fontSize: 12 }}>DELIVERY</text>
            </svg>

            <Link className="cta" to="/profile">
              <span className="k">CTA</span>
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
  );
}
