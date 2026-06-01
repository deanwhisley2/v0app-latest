-- Internal per-user startup bonus campaign window (not exposed in customer UI copy).

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS startup_bonus_campaign_ends_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.startup_bonus_campaign_ends_at IS
  'Internal: startup_bonus_received_at + 2 months. Ops/campaign eligibility only — never shown to customers.';

UPDATE public.profiles
SET startup_bonus_campaign_ends_at = startup_bonus_received_at + interval '2 months'
WHERE startup_bonus_received_at IS NOT NULL
  AND startup_bonus_campaign_ends_at IS NULL;

COMMIT;
