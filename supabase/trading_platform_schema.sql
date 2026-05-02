-- =============================================================================
-- Nexus Pro — Supabase schema additions
-- Project URL: https://unsvovnjfvhaccjnrurf.supabase.co
-- Run this entire script once in: Dashboard → SQL Editor → New query → Run
-- Assumes public.profiles already exists (do not recreate it here).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Profiles: email verification flag (existing rows stay verified by default)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.is_verified IS
  'Set FALSE on signup until email code is verified; existing users remain TRUE.';

-- -----------------------------------------------------------------------------
-- 2) Aggregated balances per user (updated by bots via your API + service role)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0,
  current_stake NUMERIC(15, 2) NOT NULL DEFAULT 0,
  available_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_balances_user_id_key UNIQUE (user_id)
);

COMMENT ON TABLE public.user_balances IS
  'Running totals: bot PnL increases total_earnings and available_balance; optional stake_delta adjusts current_stake.';

CREATE INDEX IF NOT EXISTS user_balances_user_id_idx ON public.user_balances(user_id);

-- -----------------------------------------------------------------------------
-- 3) Email verification codes (15‑minute TTL enforced in application logic)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verifications_user_id_idx ON public.email_verifications(user_id);
CREATE INDEX IF NOT EXISTS email_verifications_email_lower_idx ON public.email_verifications(lower(email));

-- -----------------------------------------------------------------------------
-- 4) Optional: append-only log of each bot trade (audit / reconciliation)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bot_trade_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pnl NUMERIC(15, 2) NOT NULL,
  current_stake_delta NUMERIC(15, 2) NOT NULL DEFAULT 0,
  symbol TEXT,
  strategy TEXT,
  external_ref TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.bot_trade_records IS
  'One row per recorded bot trade; optional external_ref dedupes retries (partial unique index below).';

CREATE INDEX IF NOT EXISTS bot_trade_records_user_created_idx
  ON public.bot_trade_records(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS bot_trade_records_external_ref_unique
  ON public.bot_trade_records(external_ref)
  WHERE external_ref IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5) Row Level Security (JWT users read own balance only; writes via service role API)
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_trade_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own balance" ON public.user_balances;
CREATE POLICY "Users can view own balance"
  ON public.user_balances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own trade records" ON public.bot_trade_records;
CREATE POLICY "Users can view own trade records"
  ON public.bot_trade_records
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- email_verifications / INSERT UPDATE: intended for service_role only (no policies).

-- Env for Next.js API (never expose service role to the browser):
--   NEXT_PUBLIC_SUPABASE_URL=https://unsvovnjfvhaccjnrurf.supabase.co
--   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
--   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
--   PROCESS_TRADE_SECRET=<random secret — bots send header x-trade-secret>
