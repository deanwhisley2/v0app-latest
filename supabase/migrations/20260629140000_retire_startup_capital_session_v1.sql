-- Retire Startup Capital Session (10-referral milestone). New-member welcome bonus + first-trade referral reward remain.

UPDATE public.platform_launch_windows
SET
  programs = programs - 'startup_capital',
  updated_at = now()
WHERE slug = 'global-referral-2026'
  AND programs ? 'startup_capital';

DROP FUNCTION IF EXISTS public.process_referral_startup_milestone(uuid, uuid);

COMMENT ON COLUMN public.profiles.referral_milestone_slot IS
  'Deprecated: was used for Startup Capital Session milestone slots (retired).';

COMMENT ON COLUMN public.profiles.startup_capital_granted_at IS
  'Deprecated: was set when Startup Capital Session milestone paid (retired). Distinct from startup_bonus_received_at (new-member welcome).';
