import { useEffect, useRef, useState } from "react";

export type ExportSection = { heading: string; lines: string[] };
export type ExportDoc = { title: string; subtitle?: string; sections: ExportSection[] };

type Props = {
  /** File name without extension. */
  fileBase: string;
  /** Element captured for the PDF / PNG snapshot. */
  captureRef: React.RefObject<HTMLElement>;
  /** Structured content used for the Word export. */
  buildDoc: () => ExportDoc;
  disabled?: boolean;
};

export default function ExportMenu({ fileBase, captureRef, buildDoc, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const snapshot = async () => {
    const el = captureRef.current;
    if (!el) throw new Error("nothing to capture");
    const { default: html2canvas } = await import("html2canvas");
    return html2canvas(el, {
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#F9F9F9",
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
    });
  };

  const run = async (kind: "pdf" | "png" | "docx") => {
    setBusy(kind);
    try {
      if (kind === "png") {
        const canvas = await snapshot();
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${fileBase}.png`;
        a.click();
      } else if (kind === "pdf") {
        const canvas = await snapshot();
        const { jsPDF } = await import("jspdf");
        const w = canvas.width;
        const h = canvas.height;
        const pdf = new jsPDF({ orientation: w > h ? "l" : "p", unit: "pt", format: [w, h] });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
        pdf.save(`${fileBase}.pdf`);
      } else {
        const data = buildDoc();
        const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
        const children = [
          new Paragraph({ text: data.title, heading: HeadingLevel.HEADING_1 }),
          ...(data.subtitle ? [new Paragraph({ children: [new TextRun({ text: data.subtitle, color: "888888" })] })] : []),
          ...data.sections.flatMap((s) => [
            new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_2 }),
            ...s.lines.map((l) => new Paragraph({ text: l })),
          ]),
        ];
        const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileBase}.docx`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setOpen(false);
    } catch (e) {
      console.error("export failed", e);
      alert("导出失败，请稍后重试");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="export-menu" ref={boxRef}>
      <button
        type="button"
        className="export-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {busy ? "导出中…" : "下载 ↓"}
      </button>
      {open && !disabled && (
        <div className="export-pop">
          <button type="button" onClick={() => run("pdf")}>PDF</button>
          <button type="button" onClick={() => run("png")}>图像 PNG</button>
          <button type="button" onClick={() => run("docx")}>Word</button>
        </div>
      )}
    </div>
  );
}
