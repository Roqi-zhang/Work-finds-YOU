import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { researchRole, adoptRole, type RoleKnowledge as Knowledge } from "@/lib/roleKnowledge";

const tier: Record<string, string> = { occupational_standard: "通用标准", company_official: "公司官方", interview_reference: "社区 / 面经参考" };

/** Numbers sources by first citation so footnotes read 1, 2, 3 down the profile. */
export function footnoteOrder(data: Knowledge) {
  const order: string[] = [];
  for (const e of data.entries) for (const id of e.sourceIds) if (!order.includes(id) && data.sources.some(s => s.id === id)) order.push(id);
  return order;
}

function sup(ids: string[], order: string[]) {
  const el = document.createElement("sup");
  el.className = "fn";
  ids.forEach(id => {
    const n = order.indexOf(id) + 1;
    if (!n) return;
    const a = document.createElement("a");
    a.href = `#src-${n}`; a.textContent = `[${n}]`;
    el.appendChild(a);
  });
  return el;
}

/** Merges knowledge entries into the existing ANALYSIS / EVIDENCE rows of each dimension. */
function fuse(data: Knowledge, order: string[]) {
  const legend = document.getElementById("legend");
  if (!legend) return;
  legend.querySelectorAll(".kf").forEach(n => n.remove());
  for (const e of data.entries) {
    const rows = legend.querySelectorAll(`.p[data-dim="${e.dimensionKey}"] dl .r .v`);
    if (rows.length < 2) continue;
    const a = document.createElement("span"); a.className = "kf";
    a.append(document.createTextNode(e.explanation), sup(e.sourceIds, order));
    rows[0].appendChild(a);
    if (e.validEvidence.length) {
      const v = document.createElement("span"); v.className = "kf";
      v.append(document.createTextNode(`有效证据：${e.validEvidence.join("；")}`), sup(e.sourceIds, order));
      rows[1].appendChild(v);
    }
  }
}

export default function RoleKnowledge({ jobId, initial, onResult, onAdopt }: { jobId: string; initial?: Knowledge | null; onResult: (v: Knowledge) => void; onAdopt: (id: string) => void }) {
  const [data, setData] = useState<Knowledge | null>(initial || null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const callbacks = useRef({ onResult, onAdopt }); callbacks.current = { onResult, onAdopt };
  const requested = useRef("");
  const load = async () => {
    setBusy(true); setError(""); setProgress("检索岗位资料…");
    try { const out = await researchRole(jobId, setProgress); setData(out); callbacks.current.onResult(out); }
    catch (e) { setError(e instanceof Error ? e.message : "资料整合暂不可用"); }
    finally { setBusy(false); setProgress(""); }
  };
  useEffect(() => { if (requested.current === jobId) return; requested.current = jobId; setData(initial || null); if (!initial || !initial.version?.endsWith("v4")) void load(); }, [jobId]);
  const order = useMemo(() => (data ? footnoteOrder(data) : []), [data]);
  useEffect(() => {
    if (!data) return;
    fuse(data, order);
    const legend = document.getElementById("legend");
    if (!legend) return;
    // The legend is rebuilt imperatively; re-fuse whenever it is redrawn.
    const obs = new MutationObserver(() => { if (!legend.querySelector(".kf") && legend.querySelector(".p")) fuse(data, order); });
    obs.observe(legend, { childList: true });
    return () => { obs.disconnect(); legend.querySelectorAll(".kf").forEach(n => n.remove()); };
  }, [data, order]);

  return <section className="sources text-foreground" aria-label="资料溯源">
    {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{progress || "整合资料中…"}</p>}
    {error && <p className="text-sm text-muted-foreground">{error} · 基础画像仍可使用</p>}
    {data && order.length > 0 && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4>Sources · 资料溯源</h4>
        <Button variant="ghost" size="sm" disabled={busy} onClick={load} aria-label="重新核对岗位资料"><RefreshCw />核对资料</Button>
      </div>
      <ol>{order.map((id, i) => { const s = data.sources.find(x => x.id === id)!; return <li key={id} id={`src-${i + 1}`}>
        <span>[{i + 1}]</span>
        <div><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline break-words">{s.title}</a>
          <div className="meta">{s.platform || s.publisher} · {tier[s.tier] || s.tier} · 发布 {s.publishedAt ? s.publishedAt.slice(0, 10) : "日期未知"} · 采集 {new Date(s.retrievedAt).toLocaleDateString()}</div></div>
      </li>; })}</ol>
      {!!data.missingPlatforms?.length && <p className="note">未取得公开内容：{data.missingPlatforms.join("、")}</p>}
      <p className="note">JD 为首要依据；补全只帮助理解，不改变评分；面经仅作参考，不是录用标准。{data.attribution}</p>
    </>}
  </section>;
}
