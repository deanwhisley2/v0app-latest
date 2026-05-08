-- -----------------------------------------------------------------------------
-- Security + levels + retailer workflow delta
-- Scope: withdraw whitelist, login sessions, user levels (1/2/5), retailer funding
-- Note: no card/bank PAN/CVV/payment rail storage is introduced in this migration.
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trading_user_level SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_trading_user_level_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_trading_user_level_check
  CHECK (trading_user_level IN (1, 2, 5));

COMMENT ON COLUMN public.profiles.trading_user_level IS
  'Authoritative user level enforced by server (allowed values: 1, 2, 5).';

CREATE TABLE IF NOT EXISTS public.withdraw_whitelist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('mobile_number', 'crypto_address')),
  holder_name TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ NULL,
  removed_by UUID NULL REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS withdraw_whitelist_active_unique
  ON public.withdraw_whitelist_entries (user_id, kind, value)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS withdraw_whitelist_user_created_idx
  ON public.withdraw_whitelist_entries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Unknown device',
  browser_name TEXT NOT NULL DEFAULT 'Unknown browser',
  user_agent TEXT NULL,
  ip_address TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  revoked_by UUID NULL REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS login_sessions_user_token_hash_uidx
  ON public.login_sessions (user_id, session_token_hash);

CREATE INDEX IF NOT EXISTS login_sessions_user_last_seen_idx
  ON public.login_sessions (user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.retailer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
  credit_basin NUMERIC(18,2) NOT NULL DEFAULT 0,
  under_review BOOLEAN NOT NULL DEFAULT FALSE,
  under_review_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.retailer_fund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  retailer_id UUID NOT NULL REFERENCES public.retailer_profiles(id) ON DELETE RESTRICT,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  tx_reference TEXT NOT NULL,
  note TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'under_review', 'appealed', 'resolved')),
  appeal_note TEXT NULL,
  reviewed_by UUID NULL REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ NULL,
  resolved_by UUID NULL REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS retailer_fund_requests_user_ref_unique
  ON public.retailer_fund_requests (user_id, tx_reference);

CREATE INDEX IF NOT EXISTS retailer_fund_requests_status_idx
  ON public.retailer_fund_requests (status, created_at DESC);
