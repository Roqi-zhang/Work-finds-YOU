CREATE TABLE public.ai_provider_access_blocks (scope text PRIMARY KEY, status integer NOT NULL CHECK (status = 403), message text NOT NULL, blocked_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.ai_provider_access_blocks TO service_role;
ALTER TABLE public.ai_provider_access_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service manages provider blocks" ON public.ai_provider_access_blocks FOR ALL TO service_role USING (true) WITH CHECK (true);