-- =============================================================================
-- Delta: exchange balance snapshot on profiles (USD totals; no API secrets)
-- Apply in Supabase SQL Editor if not already present.
-- Written by POST /api/user/exchange-balances-snapshot after browser polling.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nexus_exchange_balances_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.nexus_exchange_balances_snapshot IS
  'Versioned JSON { v:1, updatedAt, totalUsd, exchanges[] } — mount live exchange totals for bootstrap + bots; secrets stay in nexus_exchanges only.';

CREATE INDEX IF NOT EXISTS profiles_exchange_bal_snap_not_null
  ON public.profiles (id)
  WHERE nexus_exchange_balances_snapshot IS NOT NULL;
