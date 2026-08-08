WITH bad AS (
  SELECT id FROM public.job_profiles
  WHERE jsonb_array_length(coalesce(evidence_items,'[]'::jsonb)) = 0
    AND jsonb_array_length(coalesce(requirement_records,'[]'::jsonb)) = 0
)
DELETE FROM public.user_profiles WHERE target_job_profile_id IN (SELECT id FROM bad);

DELETE FROM public.job_profiles
WHERE jsonb_array_length(coalesce(evidence_items,'[]'::jsonb)) = 0
  AND jsonb_array_length(coalesce(requirement_records,'[]'::jsonb)) = 0;