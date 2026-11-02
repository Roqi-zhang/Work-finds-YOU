CREATE TABLE public.role_pack_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 pack_key text NOT NULL,
 version text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 content jsonb NOT NULL DEFAULT '{}'::jsonb,
 content_hash text NOT NULL,
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(pack_key, version)
);
GRANT SELECT ON public.role_pack_versions TO authenticated;
GRANT ALL ON public.role_pack_versions TO service_role;
ALTER TABLE public.role_pack_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_packs_read ON public.role_pack_versions FOR SELECT TO authenticated USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.job_knowledge_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_profile_id uuid NOT NULL REFERENCES public.job_profiles(id),
 user_id uuid,
 guest_key text,
 fingerprint text NOT NULL,
 pack_version_id uuid REFERENCES public.role_pack_versions(id),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 applied_job_profile_id uuid REFERENCES public.job_profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_profile_id, fingerprint)
);
GRANT SELECT ON public.job_knowledge_snapshots TO authenticated;
GRANT ALL ON public.job_knowledge_snapshots TO service_role;
ALTER TABLE public.job_knowledge_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_knowledge_read ON public.job_knowledge_snapshots FOR SELECT TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.job_profiles j WHERE j.id = job_profile_id AND j.user_id = auth.uid()));
CREATE INDEX job_knowledge_job_idx ON public.job_knowledge_snapshots(job_profile_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.protect_published_role_pack() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF OLD.status = 'published' THEN RAISE EXCEPTION 'Published role pack versions are immutable; create a new version'; END IF;
 IF NEW.status NOT IN ('draft','published') THEN RAISE EXCEPTION 'Invalid role pack status'; END IF;
 IF NEW.status = 'published' AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL) THEN RAISE EXCEPTION 'Review is required before publication'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_role_pack_version BEFORE UPDATE ON public.role_pack_versions FOR EACH ROW EXECUTE FUNCTION public.protect_published_role_pack();
COMMENT ON TABLE public.role_pack_versions IS 'Versioned editorial role mappings; only reviewed immutable published versions are authoritative pack releases.';
COMMENT ON TABLE public.job_knowledge_snapshots IS 'Private immutable provenance payloads; adopting an enriched rubric creates a separate job profile without rewriting historical reports.';