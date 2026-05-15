-- Device trust, daily FX rates, retailer desk governance statuses, funding audit log.

ALTER TABLE public.login_sessions
  ADD COLUMN IF NOT EXISTS device_trust text NOT NULL DEFAULT 'neutral';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'login_sessions_device_trust_check'
  ) THEN
    ALTER TABLE public.login_sessions
      ADD CONSTRAINT login_sessions_device_trust_check
      CHECK (device_trust IN ('neutral', 'trusted', 'blocked'));
  END IF;
END $$;

COMMENT ON COLUMN public.login_sessions.device_trust IS
  'neutral | trusted (skip new-device cooldown) | blocked (revoked, cannot be used).';

ALTER TABLE public.retailer_profiles
  DROP CONSTRAINT IF EXISTS retailer_profiles_liquidity_status_check;

ALTER TABLE public.retailer_profiles
  ADD CONSTRAINT retailer_profiles_liquidity_status_check
  CHECK (liquidity_status IN (
    'active', 'busy', 'offline', 'low_liquidity',
    'frozen', 'suspended', 'blocked'
  ));

CREATE TABLE IF NOT EXISTS public.daily_fx_rates (
  rate_date date NOT NULL,
  currency_code text NOT NULL,
  local_per_usd numeric(18, 6) NOT NULL CHECK (local_per_usd > 0),
  source text NOT NULL DEFAULT 'policy_v1',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (rate_date, currency_code)
);

COMMENT ON TABLE public.daily_fx_rates IS
  'One stable local-per-USD rate per currency per UTC calendar day for funding/withdrawal conversion.';

ALTER TABLE public.daily_fx_rates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.daily_fx_rates FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_fx_rates TO service_role;

CREATE TABLE IF NOT EXISTS public.funding_integrity_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_request_id uuid NULL REFERENCES public.retailer_fund_requests(id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  retailer_id uuid NULL REFERENCES public.retailer_profiles(id) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  audit_code text NOT NULL,
  message text NOT NULL,
  expected_usd numeric(18, 6) NULL,
  actual_usd numeric(18, 6) NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS funding_integrity_audits_created_idx
  ON public.funding_integrity_audits (created_at DESC);

ALTER TABLE public.funding_integrity_audits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.funding_integrity_audits FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.funding_integrity_audits TO service_role;
