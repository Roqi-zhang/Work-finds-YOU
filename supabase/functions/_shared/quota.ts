import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Free tier: 20 analyses per account per day (JD + resume + match combined). */
export const DAILY_LIMIT = 20;
/** Guests get exactly one run of each analysis before they must sign in. */
export const GUEST_LIMIT = 1;
/** Developer accounts bypass every quota. */
export const DEV_EMAILS = ["shihanzhang063@gmail.com"];

export type Kind = "jd" | "resume" | "match";

const COLUMN: Record<Kind, "jd_parses" | "profile_builds" | "match_runs"> = {
  jd: "jd_parses",
  resume: "profile_builds",
  match: "match_runs",
};

const GUEST_COLUMN: Record<Kind, "jd_parses" | "resume_parses" | "match_runs"> = {
  jd: "jd_parses",
  resume: "resume_parses",
  match: "match_runs",
};

export function isDeveloper(email?: string | null) {
  return !!email && DEV_EMAILS.includes(email.trim().toLowerCase());
}

/** Quota day boundary is Asia/Shanghai (UTC+8). */
export function todayPeriod(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

export async function getDailyUsage(admin: SupabaseClient, userId: string, email?: string | null) {
  const period = todayPeriod();
  const { data } = await admin
    .from("usage_counters")
    .select("id, match_runs, profile_builds, jd_parses")
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();
  const used =
    ((data?.match_runs as number | undefined) ?? 0) +
    ((data?.profile_builds as number | undefined) ?? 0) +
    ((data?.jd_parses as number | undefined) ?? 0);
  const unlimited = isDeveloper(email);
  return {
    id: (data?.id as string | undefined) ?? null,
    period,
    row: data as Record<string, number> | null,
    used,
    unlimited,
    limit: DAILY_LIMIT,
    remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, DAILY_LIMIT - used),
  };
}

/** Increment only after a real (non-cached) analysis succeeded. */
export async function consumeDaily(admin: SupabaseClient, userId: string, kind: Kind) {
  const col = COLUMN[kind];
  const { id, row, period } = await getDailyUsage(admin, userId);
  if (id) {
    await admin
      .from("usage_counters")
      .update({ [col]: ((row?.[col] as number | undefined) ?? 0) + 1 })
      .eq("id", id);
  } else {
    await admin.from("usage_counters").insert({ user_id: userId, period, [col]: 1 });
  }
}

export type GuestRow = { id: string; jd_parses: number; resume_parses: number; match_runs: number };

export async function getGuestTrial(admin: SupabaseClient, guestKey: string) {
  const { data } = await admin
    .from("guest_trials")
    .select("id, jd_parses, resume_parses, match_runs")
    .eq("guest_key", guestKey)
    .maybeSingle();
  return (data as GuestRow | null) ?? null;
}

export async function consumeGuest(admin: SupabaseClient, guestKey: string, kind: Kind) {
  const col = GUEST_COLUMN[kind];
  const row = await getGuestTrial(admin, guestKey);
  if (row) {
    await admin
      .from("guest_trials")
      .update({ [col]: ((row[col] as number | undefined) ?? 0) + 1 })
      .eq("id", row.id);
  } else {
    await admin.from("guest_trials").insert({ guest_key: guestKey, [col]: 1 });
  }
}

export const QUOTA_MESSAGE = {
  guest: "免费试用已用完 · 登录后每天可用 20 次分析",
  daily: "今日 20 次分析额度已用完，明天再来",
};
