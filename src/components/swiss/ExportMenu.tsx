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

/** Width (CSS px) the clone is laid out at — A4 portrait at ~150dpi. */
const PAGE_W = 1240;

/** Print stylesheet applied to the cloned DOM so the export reads as a document, not a screenshot. */
const PRINT_CSS = `
  html, body { background: #F9F9F9 !important; }
  .topbar, .progress, .bg-dial, .export-menu, .cta-row, .wb-foot,
  .drop, .dlg-mask, .merge { display: none !important; }
  .page, .content { width: 100% !important; max-width: none !important; padding: 0 48px !important; margin: 0 !important; }
  .screen { display: block !important; min-height: 0 !important; height: auto !important; padding: 24px 0 !important; }
  .fold .fb { max-height: none !important; overflow: visible !important; }
  .fold .ft .car, .ev-toggle .car { display: none !important; }
  .ev .ev-body { max-height: none !important; overflow: visible !important; opacity: 1 !important; }
  .evi-body { max-height: none !important; overflow: visible !important; }
  * { animation: none !important; transition: none !important; }
`;

function printify(doc: Document) {
  doc.documentElement.setAttribute("data-theme", "light");
  doc.documentElement.classList.remove("dark");
  const style = doc.createElement("style");
  style.textContent = PRINT_CSS;
  doc.head.appendChild(style);
  // Open every collapsible block so nothing is cut off in the export.
  doc.querySelectorAll(".fold, .ev, .evi").forEach((n) => n.classList.add("open"));
}

async function snapshot(el: HTMLElement) {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(el, {
    backgroundColor: "#F9F9F9",
    scale: 2,
    useCORS: true,
    logging: false,
    width: PAGE_W,
    windowWidth: PAGE_W,
    onclone: (doc) => printify(doc),
  });
}

/** Nearest blank row above the natural page bottom, so lines are never cut in half. */
function breakPoint(canvas: HTMLCanvasElement, top: number, pageH: number) {
  const bottom = Math.min(canvas.height, top + pageH);
  if (bottom >= canvas.height) return bottom;
  const ctx = canvas.getContext("2d");
  if (!ctx) return bottom;
  const look = Math.max(1, Math.floor(pageH * 0.18));
  const data = ctx.getImageData(0, bottom - look, canvas.width, look).data;
  for (let y = look - 1; y >= 0; y--) {
    const base = y * canvas.width * 4;
    const r0 = data[base];
    const g0 = data[base + 1];
    const b0 = data[base + 2];
    let uniform = true;
    for (let x = 8; x < canvas.width; x += 8) {
      const i = base + x * 4;
      if (Math.abs(data[i] - r0) > 4 || Math.abs(data[i + 1] - g0) > 4 || Math.abs(data[i + 2] - b0) > 4) {
        uniform = false;
        break;
      }
    }
    if (uniform) return bottom - look + y;
  }
  return bottom;
}

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

  const run = async (kind: "pdf" | "png" | "docx") => {
    setBusy(kind);
    try {
      if (kind === "png") {
        const el = captureRef.current;
        if (!el) throw new Error("nothing to capture");
        const canvas = await snapshot(el);
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${fileBase}.png`;
        a.click();
      } else if (kind === "pdf") {
        const el = captureRef.current;
        if (!el) throw new Error("nothing to capture");
        const canvas = await snapshot(el);
        const { jsPDF } = await import("jspdf");
        // A4 portrait in points; the canvas is scaled to the printable width.
        const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const margin = 24;
        const innerW = pw - margin * 2;
        const innerH = ph - margin * 2;
        const ratio = innerW / canvas.width; // canvas px -> pt
        const pageSlice = Math.floor(innerH / ratio); // canvas px per page

        let top = 0;
        let first = true;
        while (top < canvas.height) {
          const bottom = breakPoint(canvas, top, pageSlice);
          const sliceH = Math.max(1, bottom - top);
          const slice = document.createElement("canvas");
          slice.width = canvas.width;
          slice.height = sliceH;
          const sctx = slice.getContext("2d");
          if (!sctx) break;
          sctx.fillStyle = "#F9F9F9";
          sctx.fillRect(0, 0, slice.width, slice.height);
          sctx.drawImage(canvas, 0, top, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          if (!first) pdf.addPage();
          pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, innerW, sliceH * ratio);
          first = false;
          top = bottom;
        }
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
