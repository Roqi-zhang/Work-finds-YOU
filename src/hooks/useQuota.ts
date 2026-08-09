import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Free tier: 20 analyses per account per day (JD + resume + match combined). */
export const DAILY_LIMIT = 20;
const DEV_EMAILS = ["shihanzhang063@gmail.com"];

/** Quota day boundary is Asia/Shanghai (UTC+8) — must match the server. */
function todayPeriod() {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** Remaining daily analyses for the signed-in account (server-enforced, read-only here). */
export function useQuota() {
  const { user } = useAuth();
  const [used, setUsed] = useState<number | null>(null);

  const unlimited = !!user?.email && DEV_EMAILS.includes(user.email.trim().toLowerCase());

  const refresh = useCallback(async () => {
    if (!user) {
      setUsed(null);
      return;
    }
    const { data } = await supabase
      .from("usage_counters")
      .select("match_runs, profile_builds, jd_parses")
      .eq("user_id", user.id)
      .eq("period", todayPeriod())
      .maybeSingle();
    setUsed((data?.match_runs ?? 0) + (data?.profile_builds ?? 0) + (data?.jd_parses ?? 0));
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener("wfy:usage", onChange);
    return () => window.removeEventListener("wfy:usage", onChange);
  }, [refresh]);

  return {
    used,
    unlimited,
    limit: DAILY_LIMIT,
    remaining: unlimited ? Infinity : used == null ? null : Math.max(0, DAILY_LIMIT - used),
    refresh,
  };
}

export function notifyUsageChanged() {
  window.dispatchEvent(new Event("wfy:usage"));
}
