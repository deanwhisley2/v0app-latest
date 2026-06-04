-- Monthly net reserve ledger for Nexus Bot trade sessions (Phase 1 financial engine).

CREATE TABLE IF NOT EXISTS public.user_trade_session_earnings_reserves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  period_key text NOT NULL,
  capital_usd numeric(18, 2) NOT NULL CHECK (capital_usd > 0),
  monthly_target_pct numeric(8, 4) NOT NULL CHECK (monthly_target_pct > 0),
  gross_monthly_usd numeric(18, 2) NOT NULL CHECK (gross_monthly_usd >= 0),
  platform_fee_usd numeric(18, 2) NOT NULL CHECK (platform_fee_usd >= 0),
  net_reserve_usd numeric(18, 2) NOT NULL CHECK (net_reserve_usd >= 0),
  earned_usd numeric(18, 2) NOT NULL DEFAULT 0 CHECK (earned_usd >= 0),
  forfeited_usd numeric(18, 2) NOT NULL DEFAULT 0 CHECK (forfeited_usd >= 0),
  remaining_reserve_usd numeric(18, 2) NOT NULL CHECK (remaining_reserve_usd >= 0),
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  seed_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_trade_session_earnings_reserves_user_period_unique UNIQUE (user_id, period_key)
);

CREATE INDEX IF NOT EXISTS user_trade_session_earnings_reserves_user_idx
  ON public.user_trade_session_earnings_reserves (user_id);

COMMENT ON TABLE public.user_trade_session_earnings_reserves IS
  'Per-user monthly net earnings reserve for trade-code sessions. earned + remaining + forfeited = net_reserve_usd.';

CREATE TABLE IF NOT EXISTS public.user_trade_session_slot_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reserve_id uuid NOT NULL REFERENCES public.user_trade_session_earnings_reserves (id) ON DELETE CASCADE,
  trade_session_id uuid NOT NULL REFERENCES public.trade_sessions (id) ON DELETE CASCADE,
  day_index smallint NOT NULL CHECK (day_index >= 0 AND day_index < 31),
  session_slot text NOT NULL,
  slot_gross_usd numeric(18, 2) NOT NULL CHECK (slot_gross_usd >= 0),
  participation_weight numeric(10, 6) NOT NULL DEFAULT 1 CHECK (participation_weight >= 0 AND participation_weight <= 1),
  payout_usd numeric(18, 2) NOT NULL DEFAULT 0 CHECK (payout_usd >= 0),
  outcome text NOT NULL CHECK (outcome IN ('earned', 'forfeited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_trade_session_slot_ledger_user_session_unique UNIQUE (user_id, trade_session_id)
);

CREATE INDEX IF NOT EXISTS user_trade_session_slot_ledger_reserve_idx
  ON public.user_trade_session_slot_ledger (reserve_id);

COMMENT ON TABLE public.user_trade_session_slot_ledger IS
  'Idempotent per-session slot outcomes debiting the monthly reserve (earned or forfeited).';

ALTER TABLE public.user_trade_session_earnings_reserves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trade_session_slot_ledger ENABLE ROW LEVEL SECURITY;
