-- JS Date() rejects `+00` suffix; use Z so registration eligibility checks work.

UPDATE public.platform_launch_windows
SET
  programs = jsonb_set(
    coalesce(programs, '{}'::jsonb),
    '{new_member_welcome,eligible_after}',
    '"2026-05-29T00:42:00.000Z"'::jsonb,
    true
  ),
  updated_at = now()
WHERE slug = 'global-referral-2026'
  AND coalesce(programs->'new_member_welcome'->>'eligible_after', '') LIKE '%+00';
