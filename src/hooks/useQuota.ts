import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const FREE_MATCH_RUNS = 3;

/** Remaining free match reports for the signed-in account (server-enforced, read-only here). */
export function useQuota() {
  const { user } = useAuth();
  const [used, setUsed] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setUsed(null);
      return;
    }
    const { data } = await supabase
      .from("usage_counters")
      .select("match_runs")
      .eq("user_id", user.id)
      .eq("period", "lifetime")
      .maybeSingle();
    setUsed(data?.match_runs ?? 0);
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
    limit: FREE_MATCH_RUNS,
    remaining: used == null ? null : Math.max(0, FREE_MATCH_RUNS - used),
    refresh,
  };
}

export function notifyUsageChanged() {
  window.dispatchEvent(new Event("wfy:usage"));
}
