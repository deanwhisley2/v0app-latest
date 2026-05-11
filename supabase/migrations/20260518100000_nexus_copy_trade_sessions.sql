-- Copy-trade sessions: server-side Nexus Main debits (available_balance only — no retail/container aggregation).
CREATE TABLE IF NOT EXISTS public.copy_trade_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  trader_persona_id TEXT NOT NULL,
  stake_amount NUMERIC(15, 2) NOT NULL CHECK (stake_amount > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON COLUMN public.copy_trade_sessions.settled_at IS
  'First-write wins settlement timestamp — prevents duplicate payouts when closing a session.';

CREATE INDEX IF NOT EXISTS copy_trade_sessions_user_active_idx
  ON public.copy_trade_sessions (user_id)
  WHERE status = 'active';

COMMENT ON TABLE public.copy_trade_sessions IS
  'Copy-trade stakes funded only from Nexus Main (available_balance); closed rows recycle liquidity on settlement.';

ALTER TABLE public.copy_trade_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own copy trade sessions" ON public.copy_trade_sessions;
CREATE POLICY "Users read own copy trade sessions"
  ON public.copy_trade_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
