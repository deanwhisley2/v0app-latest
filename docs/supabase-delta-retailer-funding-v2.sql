-- -----------------------------------------------------------------------------
-- Retailer funding v2 — country retailers, liquidity, admin top-up + commission
-- Run after retailer_profiles / retailer_fund_requests exist.
-- -----------------------------------------------------------------------------

-- Level 1 user country for matching local retailers (ISO 3166-1 alpha-2, e.g. UG, KE).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS funding_country_code TEXT NULL;

COMMENT ON COLUMN public.profiles.funding_country_code IS
  'Preferred country for local mobile-money retailer matching on Add Funds.';

-- Retailer desk extensions
ALTER TABLE public.retailer_profiles
  ADD COLUMN IF NOT EXISTS is_country_retailer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS country_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS liquidity_status TEXT NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS registered_payee_names TEXT NULL,
  ADD COLUMN IF NOT EXISTS estimated_response_minutes SMALLINT NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.retailer_profiles.liquidity_status IS
  'active | busy | offline | low_liquidity — shown to Level 1 users; pairing still requires Nexus balance >= amount.';
COMMENT ON COLUMN public.retailer_profiles.is_country_retailer IS
  'True when this Level-2 desk acts as in-country liquidity / mobile-money agent.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'retailer_profiles_liquidity_status_check'
  ) THEN
    ALTER TABLE public.retailer_profiles
      ADD CONSTRAINT retailer_profiles_liquidity_status_check
      CHECK (liquidity_status IN ('active', 'busy', 'offline', 'low_liquidity'));
  END IF;
END $$;

-- Incoming fund requests from Level 1
ALTER TABLE public.retailer_fund_requests
  ADD COLUMN IF NOT EXISTS fund_channel TEXT NOT NULL DEFAULT 'legacy_admin',
  ADD COLUMN IF NOT EXISTS mobile_network TEXT NULL,
  ADD COLUMN IF NOT EXISTS retailer_approved_by UUID NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS retailer_approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS escalated_to_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escalated_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS escalation_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.retailer_fund_requests.fund_channel IS
  'local_mobile = user pays retailer MM, retailer approves internal credit; legacy_admin = older admin/basin workflow.';

DO $$
BEGIN
  ALTER TABLE public.retailer_fund_requests DROP CONSTRAINT IF EXISTS retailer_fund_requests_status_check;
  ALTER TABLE public.retailer_fund_requests
    ADD CONSTRAINT retailer_fund_requests_status_check
    CHECK (
      status IN (
        'pending',
        'approved',
        'rejected',
        'under_review',
        'appealed',
        'resolved',
        'escalated'
      )
    );
EXCEPTION
  WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'retailer_fund_requests_fund_channel_check'
  ) THEN
    ALTER TABLE public.retailer_fund_requests
      ADD CONSTRAINT retailer_fund_requests_fund_channel_check
      CHECK (fund_channel IN ('local_mobile', 'legacy_admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS retailer_fund_requests_retailer_status_idx
  ON public.retailer_fund_requests (retailer_id, status)
  WHERE status IN ('pending', 'under_review');

CREATE INDEX IF NOT EXISTS retailer_profiles_country_retailer_idx
  ON public.retailer_profiles (country_code, is_country_retailer)
  WHERE is_country_retailer = TRUE;

-- Retailer requests Nexus liquidity from admin (crypto confirmed off-chain).
CREATE TABLE IF NOT EXISTS public.retailer_admin_topup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_requested NUMERIC(18, 2) NOT NULL CHECK (amount_requested > 0),
  crypto_tx_reference TEXT NOT NULL,
  note TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'under_review')),
  commission_rate NUMERIC(8, 5) NOT NULL DEFAULT 0.05,
  amount_credited NUMERIC(18, 2) NULL,
  reviewed_by UUID NULL REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (retailer_user_id, crypto_tx_reference)
);

CREATE INDEX IF NOT EXISTS retailer_admin_topup_retailer_status_idx
  ON public.retailer_admin_topup_requests (retailer_user_id, status, created_at DESC);

COMMENT ON TABLE public.retailer_admin_topup_requests IS
  'Retailer wires crypto to company wallet; Level-5 admin approves. Nexus credits retailer_requested * (1 + commission_rate).';
