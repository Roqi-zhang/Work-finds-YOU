ALTER TABLE public.job_profiles
  ADD COLUMN IF NOT EXISTS evidence_items jsonb,
  ADD COLUMN IF NOT EXISTS requirement_records jsonb,
  ADD COLUMN IF NOT EXISTS requirement_signals jsonb,
  ADD COLUMN IF NOT EXISTS evaluation_rubric jsonb,
  ADD COLUMN IF NOT EXISTS rubric_hash text,
  ADD COLUMN IF NOT EXISTS rubric_version text,
  ADD COLUMN IF NOT EXISTS ideal_profile jsonb,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS schema_version text NOT NULL DEFAULT 'v1';

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS target_job_profile_id uuid REFERENCES public.job_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_items jsonb,
  ADD COLUMN IF NOT EXISTS experience_records jsonb,
  ADD COLUMN IF NOT EXISTS capability_signals jsonb,
  ADD COLUMN IF NOT EXISTS rubric_hash text,
  ADD COLUMN IF NOT EXISTS rubric_version text,
  ADD COLUMN IF NOT EXISTS extraction_fingerprint text,
  ADD COLUMN IF NOT EXISTS profiling_fingerprint text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS schema_version text NOT NULL DEFAULT 'v1';

ALTER TABLE public.match_reports
  ADD COLUMN IF NOT EXISTS dimension_matches jsonb,
  ADD COLUMN IF NOT EXISTS decision_factors jsonb,
  ADD COLUMN IF NOT EXISTS rationale_summary text,
  ADD COLUMN IF NOT EXISTS evidence_links jsonb,
  ADD COLUMN IF NOT EXISTS schema_version text NOT NULL DEFAULT 'v1';

CREATE INDEX IF NOT EXISTS idx_user_profiles_target_job
  ON public.user_profiles (user_id, target_job_profile_id, is_current);

CREATE INDEX IF NOT EXISTS idx_user_profiles_extraction_fp
  ON public.user_profiles (user_id, extraction_fingerprint);

CREATE INDEX IF NOT EXISTS idx_job_profiles_content_hash
  ON public.job_profiles (user_id, content_hash);