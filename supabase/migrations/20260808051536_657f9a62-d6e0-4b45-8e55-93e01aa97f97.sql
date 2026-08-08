CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('resume','jd')),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  text_len integer,
  storage_path text,
  file_name text,
  seen_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX documents_hash_kind_key ON public.documents (content_hash, kind);
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents service only" ON public.documents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.document_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('resume','jd')),
  stage text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  model text,
  scope_key text NOT NULL DEFAULT 'global',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX document_analyses_key ON public.document_analyses
  (content_hash, kind, stage, prompt_version, schema_version, scope_key);
GRANT ALL ON public.document_analyses TO service_role;
ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_analyses service only" ON public.document_analyses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_document_analyses_updated BEFORE UPDATE ON public.document_analyses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.match_reports ADD COLUMN IF NOT EXISTS pipeline jsonb NOT NULL DEFAULT '[]'::jsonb;