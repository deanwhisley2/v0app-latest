-- Fixed-trade display + recovery: persist server-authored UI fields (coin, mark) alongside principal/seed.
ALTER TABLE public.fixed_trade_sessions
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.fixed_trade_sessions.metadata IS
  'Server-owned display and recovery hints (e.g. coin_symbol, fixed_price_usd). Not a substitute for ledger balances.';
