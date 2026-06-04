-- Audit fields for trade-session participation settlements (join time, allocation, reserve source).

ALTER TABLE public.user_trade_session_slot_ledger
  ADD COLUMN IF NOT EXISTS joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS allocated_profit_usd numeric(18, 2),
  ADD COLUMN IF NOT EXISTS reserve_source text NOT NULL DEFAULT 'monthly_reserve_v1';

COMMENT ON COLUMN public.user_trade_session_slot_ledger.joined_at IS
  'User queue/join timestamp for proportional participation audit.';
COMMENT ON COLUMN public.user_trade_session_slot_ledger.allocated_profit_usd IS
  'slot_gross_usd * participation_weight before minimum settlement floor.';
COMMENT ON COLUMN public.user_trade_session_slot_ledger.reserve_source IS
  'Earnings reserve engine identifier (e.g. monthly_reserve_v1).';
