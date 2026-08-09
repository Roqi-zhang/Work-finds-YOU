import { supabase } from "@/integrations/supabase/client";
import { getGuestKey } from "@/lib/guest";

export type Level = "strong" | "medium" | "weak" | "missing";

export type EvidenceDetail = {
  label: string;
  claim: string;
  quotes: string[];
  role: string;
};

export type DimScored = {
  key: string;
  label: string;
  level: Level;
  score: number | null;
  core: boolean;
  evidence?: string;
  /** JD side only — professional read of the requirement. */
  analysis?: string;
  why?: string;
  action?: string;
  note?: string;
  evidenceDetail?: EvidenceDetail[];
};

export class AiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isJobProfileId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Friendly message for the shared failure modes of the AI gateway. */
export function aiMessage(e: unknown) {
  const err = e as AiError;
  if (err?.status === 401) return "请先登录后再使用 AI 分析";
  if (err?.status === 429) return "请求过于频繁，请稍后再试";
  if (err?.status === 402) return "AI 额度已用完，请补充额度后重试";
  return err?.message || "分析失败，请重试";
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: { guestKey: getGuestKey(), ...body },
  });
  if (error) {
    let detail = error.message;
    let status = 500;
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.text === "function") {
      status = ctx.status ?? 500;
      const raw = await ctx.text();
      try {
        detail = JSON.parse(raw).error ?? raw;
      } catch {
        detail = raw || detail;
      }
    }
    throw new AiError(status, detail);
  }
  return data as T;
}

/** Upload a resume / JD file into the private bucket under the user's own folder. */
export async function uploadFile(file: File, kind: "resume" | "jd") {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new AiError(401, "请先登录");
  // Storage object keys must be ASCII-safe — keep the original name only for display.
  const ext = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
  const rand = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, "");
  const path = `${uid}/${kind}/${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage.from("resumes").upload(path, file, { upsert: false });
  if (error) throw new AiError(500, "上传失败：" + error.message);
  return { path, fileName: file.name };
}

/** Guests have no storage access — the file travels inline instead. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new AiError(400, "文件读取失败"));
    r.readAsDataURL(file);
  });
}

/** Hand the current account's guest-owned records over after sign-in. */
export async function claimGuestRecords() {
  try {
    await supabase.functions.invoke("claim-guest", { body: { guestKey: getGuestKey() } });
  } catch {
    /* claiming is best-effort — never block the login flow */
  }
}

export type ResumeResult = {
  profileId: string;
  version: number;
  score: number;
  dimensions: DimScored[];
  sections: Record<string, string>;
};

/** `targetJobProfileId` binds the resulting candidate profile to a specific JD (JD-first flow). */
export async function parseResume(file: File, targetJobProfileId?: string) {
  const { path, fileName } = await uploadFile(file, "resume");
  return invoke<ResumeResult>("parse-resume", { filePath: path, fileName, targetJobProfileId });
}

export type KeyPoint = { title: string; detail: string };

export type JdResult = {
  job: { id: string; slug: string; title: string; company: string; location: string };
  salary: string;
  dimensions: DimScored[];
  keyPoints?: KeyPoint[];
  requirements: { text: string; hard: boolean; dim: string }[];
};


export async function parseJdText(text: string) {
  return invoke<JdResult>("parse-jd", { text });
}

/** Hash the raw bytes in the browser so the server can hit its cache before downloading. */
async function fileHashHex(file: File) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function parseJdFile(file: File) {
  const fileHash = await fileHashHex(file).catch(() => undefined);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    // Guest trial: no storage access, so the document travels inline.
    const fileData = await fileToBase64(file);
    return invoke<JdResult>("parse-jd", { fileData, fileName: file.name, fileHash });
  }
  const { path, fileName } = await uploadFile(file, "jd");
  return invoke<JdResult>("parse-jd", { filePath: path, fileName, fileHash });
}

export type MatchReport = {
  id: string;
  score: number;
  decision: { flag: string; win: string; rank: string; overview: string; missingCore: string[] };
  judgements: {
    kind: string;
    title: string;
    desc: string;
    tags: string[];
    evidence: { mine: string; required: string; reasoning: string; impact: string };
  }[];
  steps: {
    kind?: "resume" | "interview" | "portfolio";
    title: string;
    desc: string;
    applicable?: boolean;
    items?: { point: string; suggestion: string; evidence: string }[];
    mindset?: string;
    why?: string;
    effect?: string;
    sample?: string;
  }[];

  dimension_scores: DimScored[];
  sources: { label: string; at: string }[];
  reasoning_trace: string | null;
  stale: boolean;
};

export async function runMatch(jobProfileId: string, force = false, candidateProfileId?: string) {
  return invoke<{ report: MatchReport; cached: boolean; job: Record<string, unknown> }>("run-match", {
    jobProfileId,
    candidateProfileId,
    force,
  });
}
