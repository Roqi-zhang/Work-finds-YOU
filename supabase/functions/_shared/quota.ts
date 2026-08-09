import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Free tier: 3 complete match reports per account, lifetime (no monthly reset yet). */
export const FREE_MATCH_RUNS = 3;
export const PERIOD = "lifetime";

export async function getUsage(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("usage_counters")
    .select("id, match_runs, profile_builds, jd_parses")
    .eq("user_id", userId)
    .eq("period", PERIOD)
    .maybeSingle();
  const used = (data?.match_runs as number | undefined) ?? 0;
  return {
    id: (data?.id as string | undefined) ?? null,
    used,
    limit: FREE_MATCH_RUNS,
    remaining: Math.max(0, FREE_MATCH_RUNS - used),
  };
}

/** Increment only after a real (non-cached) match run succeeded. */
export async function consumeMatchRun(admin: SupabaseClient, userId: string) {
  const { id, used } = await getUsage(admin, userId);
  if (id) {
    await admin.from("usage_counters").update({ match_runs: used + 1 }).eq("id", id);
  } else {
    await admin.from("usage_counters").insert({ user_id: userId, period: PERIOD, match_runs: 1 });
  }
}
