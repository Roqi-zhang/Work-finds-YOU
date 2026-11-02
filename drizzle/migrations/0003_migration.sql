CREATE TABLE public.interview_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_key text NOT NULL,
  company text,
  title text NOT NULL,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  searched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, app_key)
);
GRANT SELECT, DELETE ON public.interview_searches TO authenticated;
GRANT ALL ON public.interview_searches TO service_role;
ALTER TABLE public.interview_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own interview searches read" ON public.interview_searches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own interview searches delete" ON public.interview_searches FOR DELETE TO authenticated USING (auth.uid() = user_id);