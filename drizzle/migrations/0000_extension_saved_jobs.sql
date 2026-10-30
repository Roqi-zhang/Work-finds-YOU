CREATE TABLE public.saved_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  company text,
  location text,
  salary text,
  source_site text,
  url text NOT NULL,
  jd_text text,
  status text NOT NULL DEFAULT '待投递',
  note text,
  job_profile_id uuid,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);
GRANT SELECT, UPDATE, DELETE ON public.saved_jobs TO authenticated;
GRANT ALL ON public.saved_jobs TO service_role;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own saved_jobs select" ON public.saved_jobs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own saved_jobs update" ON public.saved_jobs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own saved_jobs delete" ON public.saved_jobs FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER saved_jobs_updated_at BEFORE UPDATE ON public.saved_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.extension_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'Browser extension',
  last_used_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.extension_tokens TO authenticated;
GRANT ALL ON public.extension_tokens TO service_role;
ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tokens select" ON public.extension_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());