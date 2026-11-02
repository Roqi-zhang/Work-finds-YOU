import { supabase } from "@/integrations/supabase/client";
import { AiError } from "@/lib/ai";

export type InterviewLink = { title: string; url: string; platform: string; publishedAt: string | null; sameCompany: boolean; roleMatch: "same" | "close" };
export type InterviewRecord = { app_key: string; title: string; company: string | null; results: InterviewLink[]; summary: string | null; searched_at: string };

export async function loadInterviewSearches(): Promise<Record<string, InterviewRecord>> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return {};
  const { data } = await supabase.from("interview_searches").select("app_key,title,company,results,summary,searched_at");
  return Object.fromEntries(((data || []) as unknown as InterviewRecord[]).map(r => [r.app_key, r]));
}

async function call(body: Record<string, unknown>): Promise<InterviewRecord> {
  const { data, error } = await supabase.functions.invoke<{ record: InterviewRecord }>("interview-search", { body });
  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    let msg = error.message, status = 500;
    if (ctx && typeof ctx.text === "function") {
      status = ctx.status ?? 500;
      const raw = await ctx.text();
      try { msg = JSON.parse(raw).error ?? raw; } catch { msg = raw || msg; }
    }
    throw new AiError(status, msg);
  }
  return data!.record;
}

export const searchInterviews = (appKey: string, title: string, company: string) => call({ action: "search", appKey, title, company });
export const summarizeInterviews = (appKey: string, title: string, company: string) => call({ action: "summarize", appKey, title, company });
