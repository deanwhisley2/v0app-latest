-- Persist StrategyLearner blocked patterns per user (cross-restart).
-- Run once in Supabase SQL Editor after reviewing RLS.

CREATE TABLE IF NOT EXISTS public.blocked_trade_patterns (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  pattern_key TEXT NOT NULL,
  action TEXT NOT NULL,
  signal TEXT NOT NULL,
  win_rate DOUBLE PRECISION NOT NULL,
  total_trades INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blocked_trade_patterns_pkey PRIMARY KEY (user_id, pattern_key)
);

CREATE INDEX IF NOT EXISTS blocked_trade_patterns_user_idx
  ON public.blocked_trade_patterns (user_id);

ALTER TABLE public.blocked_trade_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_patterns_select_own" ON public.blocked_trade_patterns;
CREATE POLICY "blocked_patterns_select_own"
  ON public.blocked_trade_patterns FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "blocked_patterns_insert_own" ON public.blocked_trade_patterns;
CREATE POLICY "blocked_patterns_insert_own"
  ON public.blocked_trade_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "blocked_patterns_update_own" ON public.blocked_trade_patterns;
CREATE POLICY "blocked_patterns_update_own"
  ON public.blocked_trade_patterns FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "blocked_patterns_delete_own" ON public.blocked_trade_patterns;
CREATE POLICY "blocked_patterns_delete_own"
  ON public.blocked_trade_patterns FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.blocked_trade_patterns IS
  'Strategy learner blocked patterns; replayed into PreTradeValidator on dashboard load.';
