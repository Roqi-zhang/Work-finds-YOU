import { supabase } from "@/integrations/supabase/client";

export type Level = "strong" | "medium" | "weak" | "missing";

export type DimScored = {
  key: string;
  label: string;
  level: Level;
  score: number | null;
  core: boolean;
  evidence?: string;
  why?: string;
  action?: string;
  note?: string;
};

export class AiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
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
  const safe = file.name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_");
  const path = `${uid}/${kind}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("resumes").upload(path, file, { upsert: false });
  if (error) throw new AiError(500, "上传失败：" + error.message);
  return { path, fileName: file.name };
}

export type ResumeResult = {
  profileId: string;
  version: number;
  score: number;
  dimensions: DimScored[];
  sections: Record<string, string>;
};

export async function parseResume(file: File) {
  const { path, fileName } = await uploadFile(file, "resume");
  return invoke<ResumeResult>("parse-resume", { filePath: path, fileName });
}

export type JdResult = {
  job: { id: string; slug: string; title: string; company: string; location: string };
  salary: string;
  dimensions: DimScored[];
  requirements: { text: string; hard: boolean; dim: string }[];
};

export async function parseJdText(text: string) {
  return invoke<JdResult>("parse-jd", { text });
}

export async function parseJdFile(file: File) {
  const { path, fileName } = await uploadFile(file, "jd");
  return invoke<JdResult>("parse-jd", { filePath: path, fileName });
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
  steps: { title: string; desc: string; why: string; effect: string; sample: string }[];
  dimension_scores: DimScored[];
  sources: { label: string; at: string }[];
  reasoning_trace: string | null;
  stale: boolean;
};

export async function runMatch(jobProfileId: string, force = false) {
  return invoke<{ report: MatchReport; cached: boolean; job: Record<string, unknown> }>("run-match", {
    jobProfileId,
    force,
  });
}
