// Layered fingerprints + canonical hashing (Deno, Web Crypto only).
// Used to skip model calls when nothing that matters has changed.

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  // `bytes.buffer` may be a shared/oversized ArrayBuffer — slice to the exact view.
  const view = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes
    : bytes.slice();
  const digest = await crypto.subtle.digest("SHA-256", view);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable JSON: object keys sorted recursively so equal objects hash equal. */
export function canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).sort()) out[k] = walk(src[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export async function canonicalHash(value: unknown): Promise<string> {
  return await sha256Hex(canonical(value));
}

/** Layer 1–2 fingerprint. Deliberately independent of any JD / rubric so the
 *  same resume can be re-profiled against a new job without re-extracting. */
export async function extractionFingerprint(parts: {
  contentHash: string;
  promptVersion: string;
  schemaVersion: string;
  model: string;
}) {
  return await sha256Hex(
    [parts.contentHash, parts.promptVersion, parts.schemaVersion, parts.model].join("|"),
  );
}

/** Layer 3–4 fingerprint. Includes the rubric, so switching JD invalidates only this half. */
export async function profilingFingerprint(parts: {
  extractionFingerprint: string;
  rubricHash: string;
  promptVersion: string;
  schemaVersion: string;
  model: string;
}) {
  return await sha256Hex(
    [
      parts.extractionFingerprint,
      parts.rubricHash,
      parts.promptVersion,
      parts.schemaVersion,
      parts.model,
    ].join("|"),
  );
}
