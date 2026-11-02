import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { platformLinks } from "../../../supabase/functions/_shared/interview-policy";
import { summarizeInterviews, type InterviewRecord } from "@/lib/interviewSearch";
import { aiMessage } from "@/lib/ai";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appKey: string;
  title: string;
  company: string;
  record?: InterviewRecord;
  loading: boolean;
  error: string | null;
  onResearch: () => void;
  onRecord: (r: InterviewRecord) => void;
};

export default function InterviewLinks({ open, onOpenChange, appKey, title, company, record, loading, error, onResearch, onRecord }: Props) {
  const [summing, setSumming] = useState(false);
  const [sumErr, setSumErr] = useState<string | null>(null);
  const links = record?.results || [];

  const summarize = async () => {
    setSumming(true); setSumErr(null);
    try { onRecord(await summarizeInterviews(appKey, title, company)); }
    catch (e) { setSumErr(aiMessage(e)); }
    finally { setSumming(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="iv-dialog max-w-2xl rounded-none border-[0.5px] max-h-[85vh] overflow-y-auto">
        <div className="iv-head">
          <div>
            <DialogTitle className="iv-title">{company} · {title}</DialogTitle>
            <DialogDescription className="iv-meta">
              {loading ? "正在搜索各平台面经…" : record ? `搜索于 ${record.searched_at.slice(0, 10)} · ${links.length} 条` : ""}
            </DialogDescription>
          </div>
          {record && (
            <button type="button" className="iv-icon" onClick={onResearch} disabled={loading} title="重新搜索" aria-label="重新搜索">
              <RotateCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          )}
        </div>

        {loading && !record && <p className="iv-empty">正在搜索小红书、牛客、BOSS 等平台，通常需要 20–40 秒…</p>}
        {error && <p className="iv-empty">{error}</p>}
        {!loading && record && !links.length && <p className="iv-empty">暂未找到这个岗位的面经</p>}

        {links.length > 0 && (
          <ol className="iv-list">
            {links.map((l, i) => (
              <li key={l.url}>
                <span className="iv-n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a>
                  <span className="iv-sub">
                    {l.platform}{l.publishedAt ? ` · ${l.publishedAt}` : ""}{l.sameCompany ? "" : " · 其他公司同岗"}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}

        {links.length > 0 && (
          <div className="iv-sum">
            {record?.summary ? (
              <pre>{record.summary}</pre>
            ) : (
              <button type="button" className="iv-btn" onClick={summarize} disabled={summing}>
                {summing ? "AI 正在阅读原文…" : "一键 AI 总结"}
              </button>
            )}
            {sumErr && <p className="iv-empty">{sumErr}</p>}
          </div>
        )}

        <div className="iv-more">
          继续搜：
          {platformLinks(title, company).map(p => (
            <a key={p.platform} href={p.url} target="_blank" rel="noopener noreferrer">{p.platform}</a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
