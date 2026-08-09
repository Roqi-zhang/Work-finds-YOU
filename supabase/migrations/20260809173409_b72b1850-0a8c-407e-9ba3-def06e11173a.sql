ALTER TABLE public.guest_trials
  ADD COLUMN IF NOT EXISTS resume_parses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_runs integer NOT NULL DEFAULT 0;

ALTER TABLE public.user_profiles
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS guest_key text;

ALTER TABLE public.match_reports
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS guest_key text;

CREATE INDEX IF NOT EXISTS user_profiles_guest_key_idx ON public.user_profiles (guest_key);
CREATE INDEX IF NOT EXISTS match_reports_guest_key_idx ON public.match_reports (guest_key);

CREATE UNIQUE INDEX IF NOT EXISTS usage_counters_user_period_idx ON public.usage_counters (user_id, period);