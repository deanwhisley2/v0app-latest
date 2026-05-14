-- Track server-backed partial earnings releases from fixed sessions into container liquid (withdrawable) balance.
ALTER TABLE public.fixed_trade_sessions
  ADD COLUMN IF NOT EXISTS last_earnings_release_at TIMESTAMPTZ NULL;

ALTER TABLE public.fixed_trade_sessions
  ADD COLUMN IF NOT EXISTS cumulative_earnings_released_usd NUMERIC(15, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.fixed_trade_sessions.last_earnings_release_at IS
  'Timestamp of last successful partial earnings release (5-day / daily cadence) toward container liquid.';

COMMENT ON COLUMN public.fixed_trade_sessions.cumulative_earnings_released_usd IS
  'Sum of gross earnings amounts released from this fixed session into user container liquid (pre–main transfer).';
