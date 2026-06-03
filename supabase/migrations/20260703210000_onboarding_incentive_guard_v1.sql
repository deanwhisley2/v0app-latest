-- One-time onboarding incentive ledger + immutability guards.

CREATE TABLE IF NOT EXISTS public.platform_incentive_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  incentive_type text NOT NULL,
  amount_usd numeric(12, 2) NOT NULL CHECK (amount_usd > 0),
  ledger_reference_id text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_incentive_grants_user_type_unique UNIQUE (user_id, incentive_type),
  CONSTRAINT platform_incentive_grants_ledger_reference_unique UNIQUE (ledger_reference_id)
);

CREATE INDEX IF NOT EXISTS platform_incentive_grants_user_id_idx
  ON public.platform_incentive_grants (user_id);

ALTER TABLE public.platform_incentive_grants ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.platform_incentive_grants IS
  'Append-only grant registry for one-time platform incentives (startup capital, etc.). Service role writes only.';

CREATE OR REPLACE FUNCTION public.profiles_startup_bonus_received_at_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.startup_bonus_received_at IS NOT NULL
     AND NEW.startup_bonus_received_at IS DISTINCT FROM OLD.startup_bonus_received_at THEN
    RAISE EXCEPTION 'startup_bonus_received_at is immutable once set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_startup_bonus_received_at_immutable ON public.profiles;
CREATE TRIGGER profiles_startup_bonus_received_at_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_startup_bonus_received_at_immutable();

CREATE OR REPLACE FUNCTION public.profiles_first_deposit_bonus_applied_at_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.first_deposit_bonus_applied_at IS NOT NULL
     AND NEW.first_deposit_bonus_applied_at IS DISTINCT FROM OLD.first_deposit_bonus_applied_at THEN
    RAISE EXCEPTION 'first_deposit_bonus_applied_at is immutable once set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_first_deposit_bonus_applied_at_immutable ON public.profiles;
CREATE TRIGGER profiles_first_deposit_bonus_applied_at_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_first_deposit_bonus_applied_at_immutable();
