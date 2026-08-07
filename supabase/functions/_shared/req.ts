import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Download a file from the private `resumes` bucket and turn it into a
 *  model content block. Images go multimodal; PDF/DOCX are text-extracted
 *  because the configured model does not accept documents inline. */
export async function fileToBlock(admin: SupabaseClient, bucket: string, path: string, fileName: string) {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Download failed: ${error?.message || "no data"}`);
  return await bufferToBlock(new Uint8Array(await data.arrayBuffer()), fileName);
}

/** Same conversion for bytes that never hit storage (guest inline uploads). */
export async function bufferToBlock(buf: Uint8Array, fileName: string) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();

  if (ext === "docx") {
    const mammoth = await import("npm:mammoth@1.8.0");
    const out = await mammoth.extractRawText({ buffer: buf });
    return { type: "text", text: out.value.slice(0, 60000) } as const;
  }
  if (ext === "doc") {
    throw new Error("UNSUPPORTED_DOC");
  }
  if (ext === "txt" || ext === "md") {
    return { type: "text", text: new TextDecoder().decode(buf).slice(0, 60000) } as const;
  }

  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "heic"].includes(ext)) {
    const mime = ext === "jpg" ? "jpeg" : ext;
    return { type: "image_url", image_url: { url: `data:image/${mime};base64,${base64(buf)}` } } as const;
  }

  // Default / PDF: extract the text layer.
  const { extractText, getDocumentProxy } = await import("npm:unpdf@0.12.1");
  let text = "";
  try {
    const pdf = await getDocumentProxy(buf);
    const out = await extractText(pdf, { mergePages: true });
    text = (Array.isArray(out.text) ? out.text.join("\n") : out.text) || "";
  } catch (e) {
    console.error("pdf extract failed", e);
    throw new Error("UNREADABLE_PDF");
  }
  if (text.replace(/\s/g, "").length < 30) throw new Error("UNREADABLE_PDF");
  return { type: "text", text: text.slice(0, 60000) } as const;
}

export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64(bytes: Uint8Array) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function logCall(
  admin: SupabaseClient,
  row: {
    user_id: string;
    task: string;
    model?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    latency_ms?: number;
    status?: string;
    error?: string;
  },
) {
  try {
    await admin.from("ai_call_logs").insert({ provider: "lovable-ai", ...row });
  } catch (e) {
    console.error("log failed", e);
  }
}
