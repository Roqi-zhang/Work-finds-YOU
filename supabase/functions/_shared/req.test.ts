import { bufferToBlock, decodeBase64 } from "./req.ts";
import { sha256Hex } from "./hash.ts";

Deno.test("large PDF passes intact to the model without local PDF parsing", async () => {
  const bytes = new Uint8Array(1_738_579);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  bytes[bytes.length - 1] = 123;
  const block = await bufferToBlock(bytes, "简历.pdf");
  if (block.type !== "file") throw new Error("PDF must be a file block");
  if (block.file.filename !== "简历.pdf") throw new Error("Filename lost");
  const decoded = decodeBase64(block.file.file_data.split(",")[1]);
  if (decoded.length !== bytes.length || decoded[decoded.length - 1] !== 123) {
    throw new Error("PDF was truncated");
  }
});

Deno.test("PDFs differing after the old hash cutoff have distinct cache keys", async () => {
  const bytes = new Uint8Array(300_000);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  const first = await bufferToBlock(bytes, "resume.pdf");
  bytes[bytes.length - 1] = 1;
  const second = await bufferToBlock(bytes, "resume.pdf");
  if (await sha256Hex(JSON.stringify(first)) === await sha256Hex(JSON.stringify(second))) {
    throw new Error("Different PDFs share a cache key");
  }
});

Deno.test("empty or mislabeled PDFs are rejected", async () => {
  for (const bytes of [new Uint8Array(), new TextEncoder().encode("not a PDF")]) {
    try {
      await bufferToBlock(bytes, "resume.pdf");
    } catch (error) {
      if (error instanceof Error && error.message === "UNREADABLE_PDF") continue;
      throw error;
    }
    throw new Error("Invalid PDF accepted");
  }
});