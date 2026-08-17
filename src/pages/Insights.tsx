import { useCallback, useEffect, useState, CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TopBar from "@/components/swiss/TopBar";

type Funnel = { key: string; label: string; visitors: number; conversion: number; dropped: number; failed: number; abandoned: number };
type Data = {
  days: number;
  generatedAt: string;
  totals: Record<string, number>;
  funnel: Funnel[];
  trend: { day: string; visitors: number; matches: number }[];
  channels: { name: string; visitors: number }[];
  devices: { name: string; visitors: number }[];
  timings: { label: string; ok: number; fail: number; failRate: number; p50: number; p90: number }[];
  errors: { name: string; count: number }[];
};

const RANGES = [
  { days: 1, label: "今天" },
  { days: 7, label: "7 天" },
  { days: 30, label: "30 天" },
  { days: 90, label: "90 天" },
];

const cap: CSSProperties = { fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted, #888)" };
const card: CSSProperties = { border: "0.5px solid var(--line, #D4D4D4)", padding: 16 };
const th: CSSProperties = { ...cap, textAlign: "left", padding: "8px 10px", borderBottom: "0.5px solid var(--line, #D4D4D4)" };
const td: CSSProperties = { fontSize: 13, padding: "8px 10px", borderBottom: "0.5px solid var(--line, #D4D4D4)" };

export default function Insights() {
  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const { data: out, error: err } = await supabase.functions.invoke<Data>("insights", { body: { days } });
    if (err) {
      const detail = "context" in err ? await (err as { context: Response }).context.text().catch(() => "") : "";
      setError(detail || err.message);
    } else {
      setError(null);
      setData(out ?? null);
    }
    setBusy(false);
  }, [days]);

  useEffect(() => {
    if (!user) return;
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [user, load]);

  if (authLoading) return null;

  if (!user) {
    return (
      <main className="page" style={{ padding: 32 }}>
        <TopBar />
        <p style={{ fontSize: 14, marginTop: 40 }}>请先登录管理员账号后查看数据看板。</p>
      </main>
    );
  }

  const max = Math.max(1, ...(data?.funnel.map((f) => f.visitors) ?? [1]));
  const trendMax = Math.max(1, ...(data?.trend.map((t) => t.visitors) ?? [1]));

  return (
    <main className="page" style={{ padding: "0 32px 64px" }}>
      <TopBar />

      <header style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", margin: "32px 0 24px" }}>
        <h1 style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>数据看板</h1>
        <span style={cap}>Insights · Funnel</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              style={{
                ...cap,
                padding: "6px 12px",
                cursor: "pointer",
                border: "0.5px solid var(--line, #D4D4D4)",
                background: days === r.days ? "var(--ink, #0A0A0A)" : "transparent",
                color: days === r.days ? "var(--bg, #F1F1F1)" : "inherit",
              }}
            >
              {r.label}
            </button>
          ))}
          <button onClick={() => void load()} style={{ ...cap, padding: "6px 12px", cursor: "pointer", border: "0.5px solid var(--line, #D4D4D4)", background: "transparent", color: "inherit" }}>
            {busy ? "刷新中" : "刷新"}
          </button>
        </span>
      </header>

      {error && <p style={{ fontSize: 13, color: "#B4231F" }}>{error}</p>}

      {data && (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            {[
              ["访客数", data.totals.visitors],
              ["会话数", data.totals.sessions],
              ["页面浏览", data.totals.pageViews],
              ["完成匹配", data.totals.matches],
              ["注册成功", data.totals.signups],
              ["额度拦截", data.totals.quotaBlocked],
            ].map(([label, value]) => (
              <div key={String(label)} style={card}>
                <div style={cap}>{label}</div>
                <div style={{ fontSize: 30, fontWeight: 500, marginTop: 8 }}>{value as number}</div>
              </div>
            ))}
          </section>

          <section style={{ ...card, marginTop: 24 }}>
            <div style={cap}>转化漏斗 · Funnel</div>
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              {data.funnel.map((f) => (
                <div key={f.key}>
                  <div style={{ display: "flex", fontSize: 13, marginBottom: 6 }}>
                    <span>{f.label}</span>
                    <span style={{ marginLeft: "auto", color: "var(--muted, #888)" }}>
                      {f.visitors} 人 · 转化 {f.conversion}% · 流失 {f.dropped}（失败 {f.failed} / 放弃 {f.abandoned}）
                    </span>
                  </div>
                  <div style={{ height: 10, background: "var(--line, #E4E4E4)" }}>
                    <div style={{ height: "100%", width: `${(f.visitors / max) * 100}%`, background: "var(--ink, #0A0A0A)" }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...card, marginTop: 24 }}>
            <div style={cap}>每日趋势 · 访客 / 匹配</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140, marginTop: 16 }}>
              {data.trend.map((t) => (
                <div key={t.day} style={{ flex: 1, maxWidth: 48, textAlign: "center" }} title={`${t.day} · 访客 ${t.visitors} · 匹配 ${t.matches}`}>
                  <div style={{ height: `${(t.visitors / trendMax) * 110}px`, background: "var(--ink, #0A0A0A)" }} />
                  <div style={{ height: `${(t.matches / trendMax) * 110}px`, background: "var(--muted, #888)" }} />
                  <div style={{ ...cap, fontSize: 9, marginTop: 6 }}>{t.day.slice(5)}</div>
                </div>
              ))}
              {!data.trend.length && <span style={{ fontSize: 13 }}>暂无数据</span>}
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 24 }}>
            <Table title="流量来源 · Channel" head={["来源", "访客"]} rows={data.channels.map((c) => [c.name, c.visitors])} />
            <Table title="设备 · Device" head={["设备", "访客"]} rows={data.devices.map((d) => [d.name, d.visitors])} />
            <Table
              title="AI 步骤耗时与失败率"
              head={["步骤", "成功", "失败率", "P50", "P90"]}
              rows={data.timings.map((t) => [t.label, t.ok, `${t.failRate}%`, `${Math.round(t.p50 / 100) / 10}s`, `${Math.round(t.p90 / 100) / 10}s`])}
            />
            <Table title="失败原因 Top" head={["原因", "次数"]} rows={data.errors.map((e) => [e.name, e.count])} />
          </section>

          <p style={{ ...cap, marginTop: 20 }}>更新于 {new Date(data.generatedAt).toLocaleString()} · 每 30 秒自动刷新</p>
        </>
      )}
    </main>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div style={card}>
      <div style={cap}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr>{head.map((h) => <th key={h} style={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} style={td}>{c}</td>)}</tr>
            ))
          ) : (
            <tr><td style={td} colSpan={head.length}>暂无数据</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
