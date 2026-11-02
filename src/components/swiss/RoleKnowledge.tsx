import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { researchRole, adoptRole, type RoleKnowledge as Knowledge } from "@/lib/roleKnowledge";

const basis: Record<string, string> = { jd_supported_enrichment: "基于 JD 职责与标准的补全", general_reference: "通用能力参考 · 非招聘硬门槛", interview_reference: "公司 / 面试情境参考" };
const tier: Record<string, string> = { occupational_standard: "岗位通用标准", company_official: "公司官方资料", interview_reference: "公开情境参考 · 非正式录用标准" };
export default function RoleKnowledge({ jobId, initial, onResult, onAdopt }: { jobId: string; initial?: Knowledge | null; onResult: (v: Knowledge) => void; onAdopt: (id: string) => void }) {
  const [data, setData] = useState<Knowledge | null>(initial || null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const callbacks = useRef({ onResult, onAdopt }); callbacks.current = { onResult, onAdopt };
  const requested = useRef("");
  const load = async () => {
    setBusy(true); setError(""); setProgress("核对岗位资料…");
    try { const out = await researchRole(jobId, setProgress); setData(out); callbacks.current.onResult(out); }
    catch (e) { setError(e instanceof Error ? e.message : "补全暂不可用"); }
    finally { setBusy(false); setProgress(""); }
  };
  useEffect(() => { if (requested.current === jobId) return; requested.current = jobId; setData(initial || null); if (!initial) void load(); }, [jobId]);
  return <section className="mt-8 space-y-4 text-foreground" aria-label="岗位能力依据">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4>04 · Role knowledge · 岗位能力依据</h4>
      <Button variant="ghost" size="sm" disabled={busy} onClick={load} aria-label="重新核对岗位资料"><RefreshCw />核对资料</Button>
    </div>
    {busy && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin" />{progress}</p>}
    {error && <p role="alert" className="break-words text-muted-foreground">{error} · JD 基础画像仍可使用。</p>}
    {data && <>
      <p>{data.summary}</p>
      <p className="text-sm text-muted-foreground">{data.packStatus === "published" ? `已审核能力包 · ${data.packVersion}` : "能力包映射待审核 · 当前补全为有来源的分析解释"}</p>
      {data.entries.map((entry, i) => <article key={`${entry.title}-${i}`} className="space-y-2 py-3">
        <h5>{entry.title}</h5><p className="text-sm text-muted-foreground">{basis[entry.basis]}</p>
        <p>{entry.explanation}</p>
        <ul className="list-disc space-y-1 pl-5">{entry.behaviors.map((b, n) => <li key={n}>{b}</li>)}</ul>
        <p className="text-sm">有效证据：{entry.validEvidence.join("；") || "待确认"}</p>
        <div className="flex flex-wrap gap-3">{entry.sourceIds.map(id => { const s = data.sources.find(x => x.id === id); return s ? <a className="inline-flex items-center gap-1 text-sm underline" key={id} href={s.url} target="_blank" rel="noopener noreferrer">{s.title}<ExternalLink className="h-3 w-3" /></a> : null; })}</div>
      </article>)}
      <details><summary className="cursor-pointer">来源、日期与版本</summary><div className="space-y-4 py-3">{data.sources.map(s => <div key={s.id} className="space-y-1 break-words text-sm">
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.title}</a>
        <p>{tier[s.tier]} · {s.publisher}</p><p>发布：{s.publishedAt || "日期未知"} · 采集：{new Date(s.retrievedAt).toLocaleDateString()}</p>
        <p>{s.locator}</p><blockquote className="text-muted-foreground">{s.excerpt.slice(0, 500)}</blockquote>
      </div>)}<p>{data.version} · {data.disclaimer}</p><p lang="en">{data.attribution}</p></div></details>
      <Button variant="outline" disabled={busy || !data.entries.some(e => e.basis === "jd_supported_enrichment")} onClick={async () => {
        setBusy(true); setError(""); try { callbacks.current.onAdopt(await adoptRole(jobId, data.snapshotId)); } catch(e) { setError(e instanceof Error ? e.message : "采用失败"); } finally { setBusy(false); }
      }}><Check />采用补全标准，重新建立候选人画像</Button>
    </>}
  </section>;
}