-- -----------------------------------------------------------------------------
-- Referrals: unique code per profile + optional referrer attribution (safe re-run)
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.referral_code IS
  'Public share id for ?ref= registration links; unique when set.';

COMMENT ON COLUMN public.profiles.referred_by IS
  'Profile id of the referring user at signup (anti-abuse + rewards pipeline).';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx
  ON public.profiles (referred_by);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referrer_first_deposit_bonus_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.profiles.referrer_first_deposit_bonus_at IS
  'Set when referrer has been paid the one-time first-deposit bonus for this referee.';
