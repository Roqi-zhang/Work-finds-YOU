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
/** Centred content column inside that page. */
const CONTENT_W = 980;

/** Print stylesheet applied to the cloned DOM so the export reads as a document, not a screenshot. */
const PRINT_CSS = `
  html, body { background: #F9F9F9 !important; }
  .topbar, .progress, .bg-dial, .export-menu, .cta-row, .wb-foot,
  .drop, .dlg-mask, .merge { display: none !important; }
  .page, .content {
    width: ${CONTENT_W}px !important; max-width: ${CONTENT_W}px !important;
    padding: 0 !important; margin: 0 auto !important;
  }
  .screen { display: block !important; min-height: 0 !important; height: auto !important; padding: 28px 0 !important; }
  /* Two-column layouts stack and centre so nothing hugs the left edge. */
  .wb-grid, .layout, .layout.wb, .prof-grid, .jp-grid {
    display: block !important; grid-template-columns: none !important; gap: 0 !important;
  }
  .wb-col, .col, .stage {
    width: 100% !important; max-width: 100% !important;
    border-left: 0 !important; padding-left: 0 !important; margin: 0 0 32px 0 !important;
  }
  /* Flower: full size, never scaled down or clipped. */
  .layout.wb .petal-stage, .petal-stage { zoom: 1 !important; }
  .petal-stage {
    display: flex !important; flex-direction: column !important; align-items: center !important;
    overflow: visible !important; margin: 24px auto 32px !important; page-break-inside: avoid;
  }
  .flower-svg {
    opacity: 1 !important; transform: none !important;
    width: 520px !important; height: 520px !important; max-width: 100% !important; display: block !important;
  }
  .moon-score { display: flex !important; justify-content: center !important; margin: 24px auto !important; }
  .fold .fb { max-height: none !important; overflow: visible !important; }
  .fold .ft .car, .ev-toggle .car { display: none !important; }
  .ev .ev-body { max-height: none !important; overflow: visible !important; opacity: 1 !important; }
  .evi-body { max-height: none !important; overflow: visible !important; }
  * { animation: none !important; transition: none !important; }
`;

/** Blocks that must never be split across a page break (canvas px ranges). */
type Block = { top: number; bottom: number };

function printify(doc: Document) {
  doc.documentElement.setAttribute("data-theme", "light");
  doc.documentElement.classList.remove("dark");
  const style = doc.createElement("style");
  style.textContent = PRINT_CSS;
  doc.head.appendChild(style);
  // Open every collapsible block so nothing is cut off in the export.
  doc.querySelectorAll(".fold, .ev, .evi").forEach((n) => n.classList.add("open"));
}

async function snapshot(el: HTMLElement, scale = 2) {
  const { default: html2canvas } = await import("html2canvas");
  const blocks: Block[] = [];
  const canvas = await html2canvas(el, {
    backgroundColor: "#F9F9F9",
    scale,
    useCORS: true,
    logging: false,
    width: PAGE_W,
    windowWidth: PAGE_W,
    onclone: (doc, cloned) => {
      printify(doc);
      const rootTop = cloned.getBoundingClientRect().top;
      cloned.querySelectorAll<HTMLElement>(".petal-stage, .moon-score").forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.height > 0) blocks.push({ top: (r.top - rootTop) * scale, bottom: (r.bottom - rootTop) * scale });
      });
    },
  });
  return { canvas, blocks };
}

/** Nearest blank row above the natural page bottom, so lines are never cut in half. */
function breakPoint(canvas: HTMLCanvasElement, top: number, pageH: number, blocks: Block[] = []) {
  const bottom = Math.min(canvas.height, top + pageH);
  if (bottom >= canvas.height) return bottom;

  // Never split a flower / score block: push it whole to the next page.
  for (const b of blocks) {
    if (b.top > top + 8 && b.top < bottom && b.bottom > bottom) return Math.floor(b.top - 8);
  }

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
        const { canvas } = await snapshot(el);
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${fileBase}.png`;
        a.click();
      } else if (kind === "pdf") {
        const el = captureRef.current;
        if (!el) throw new Error("nothing to capture");
        // Native print: the browser renders the real page layout 1:1 and the
        // user picks "Save as PDF" in the print dialog.
        const opened: Element[] = [];
        el.querySelectorAll(".fold, .ev, .evi").forEach((n) => {
          if (!n.classList.contains("open")) {
            n.classList.add("open");
            opened.push(n);
          }
        });
        const prevTheme = document.documentElement.getAttribute("data-theme");
        document.documentElement.setAttribute("data-theme", "light");
        el.classList.add("print-root");
        setOpen(false);
        try {
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          window.print();
        } finally {
          el.classList.remove("print-root");
          opened.forEach((n) => n.classList.remove("open"));
          if (prevTheme) document.documentElement.setAttribute("data-theme", prevTheme);
          else document.documentElement.removeAttribute("data-theme");
        }


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
