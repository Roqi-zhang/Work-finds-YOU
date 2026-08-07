ALTER TABLE public.job_profiles ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.job_profiles ADD COLUMN IF NOT EXISTS guest_key text;
CREATE INDEX IF NOT EXISTS idx_job_profiles_guest_key ON public.job_profiles (guest_key) WHERE guest_key IS NOT NULL;

DROP INDEX IF EXISTS idx_job_profiles_slug;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_profiles_user_slug ON public.job_profiles (user_id, slug) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_profiles_guest_slug ON public.job_profiles (guest_key, slug) WHERE user_id IS NULL AND guest_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.guest_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_key text NOT NULL UNIQUE,
  jd_parses integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.guest_trials TO service_role;

ALTER TABLE public.guest_trials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guest_trials service only" ON public.guest_trials FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_guest_trials_updated BEFORE UPDATE ON public.guest_trials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();