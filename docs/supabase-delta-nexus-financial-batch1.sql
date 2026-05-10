-- -----------------------------------------------------------------------------
-- Nexus financial ecosystem — Batch 1 (safe re-run)
-- - Pending withdrawals moved off Nexus Main into frozen bucket until L5 decision
-- - Fixed trade session ledger rows
-- - Relax container_balance_events.event_type CHECK so audit trail accepts new flows
-- -----------------------------------------------------------------------------

ALTER TABLE public.user_balances
  ADD COLUMN IF NOT EXISTS withdrawal_pending_balance NUMERIC(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_balances.withdrawal_pending_balance IS
  'Funds deducted from available_balance at withdrawal initiation; awaiting Level 5 approve/reject.';

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  currency_context TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  transaction_ref TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS withdrawal_requests_user_created_idx
  ON public.withdrawal_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx
  ON public.withdrawal_requests (status, created_at DESC);

COMMENT ON TABLE public.withdrawal_requests IS
  'User withdrawals: funds leave available_balance immediately into withdrawal_pending_balance until liquidity admin acts.';

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Users read own withdrawal requests"
  ON public.withdrawal_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.fixed_trade_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  principal_amount NUMERIC(15,2) NOT NULL CHECK (principal_amount > 0),
  insurance_fee_amount NUMERIC(15,2) NOT NULL CHECK (insurance_fee_amount >= 0),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('Low', 'Medium', 'High')),
  fix_period_months INT NOT NULL CHECK (fix_period_months IN (1, 3, 6)),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled_early', 'emergency_closed')),
  trader_persona_id TEXT NULL,
  seed_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS fixed_trade_sessions_user_created_idx
  ON public.fixed_trade_sessions (user_id, created_at DESC);

COMMENT ON TABLE public.fixed_trade_sessions IS
  'Fixed/container locks funded only from Nexus Main (available_balance); insurance deducted at open.';

ALTER TABLE public.fixed_trade_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own fixed trade sessions" ON public.fixed_trade_sessions;
CREATE POLICY "Users read own fixed trade sessions"
  ON public.fixed_trade_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Legacy installs used a tight CHECK — drop so new event_type strings can post to the ledger.
ALTER TABLE public.container_balance_events
  DROP CONSTRAINT IF EXISTS container_balance_events_event_type_check;

-- Early exit / completion timestamp (idempotent for installs that only ran CREATE without this column)
ALTER TABLE public.fixed_trade_sessions
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL;
