import { useEffect, useState } from "react";
import { addToPool, getPoolMeta, isInPool, type Job } from "@/lib/wfy";
import "@/styles/later-dialog.css";

type Props = { job: Job; open: boolean; onClose: () => void; onSaved?: () => void };

export default function LaterDialog({ job, open, onClose, onSaved }: Props) {
  const [reason, setReason] = useState("");
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const editing = isInPool(job.id);

  useEffect(() => {
    if (!open) return;
    const m = getPoolMeta(job.id);
    setReason(m.reason || "");
    setLink(m.link || "");
    setErr("");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, job.id, onClose]);

  if (!open) return null;

  const save = () => {
    const l = link.trim();
    if (l && !/^https?:\/\/\S+$/i.test(l)) {
      setErr("请粘贴以 http:// 或 https:// 开头的链接");
      return;
    }
    addToPool(job, { reason: reason.trim().slice(0, 200), link: l });
    onClose();
    onSaved?.();
  };

  return (
    <div className="later-mask" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="later-dlg" role="dialog" aria-modal="true" aria-labelledby="later-title">
        <div className="later-k">
          {job.co} · {job.title}
        </div>
        <h5 id="later-title">稍后考虑这个岗位</h5>
        <p className="later-hint">记下现在的顾虑，之后在比较池里一起权衡。两项都可以不填。</p>

        <label className="later-field">
          <span>犹豫原因</span>
          <textarea
            value={reason}
            maxLength={200}
            rows={3}
            placeholder="例如：薪资未写明 / 需要搬家 / 经验要求偏高"
            onChange={(e) => setReason(e.target.value)}
          />
          <em>{reason.length} / 200</em>
        </label>

        <label className="later-field">
          <span>投递链接</span>
          <input
            type="url"
            value={link}
            placeholder="粘贴岗位投递页面链接"
            onChange={(e) => {
              setLink(e.target.value);
              setErr("");
            }}
          />
          {err && <em className="later-err">{err}</em>}
        </label>

        <div className="later-row">
          <button className="btn ghost" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn" type="button" onClick={save}>
            {editing ? "保存修改" : "放入比较池"}
          </button>
        </div>
      </div>
    </div>
  );
}
