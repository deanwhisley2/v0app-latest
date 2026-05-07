-- =============================================================================
-- REPLACE legacy public.blocked_trade_patterns (wrong column layout)
-- =============================================================================
--
-- SYMPTOMS
--   • ERROR 42703: column "user_id" does not exist when applying the master bundle or
--     supabase/blocked_trade_patterns.sql
-- REASON
--   CREATE TABLE IF NOT EXISTS skips if ANY table named blocked_trade_patterns exists.
--   Older / alternate schemas used e.g. (id INTEGER, pattern TEXT, win_rate, …) instead
--   of the app's (user_id UUID, pattern_key, action, signal, wins, losses, …).
--
-- DATA LOSS WARNING
--   This drops all rows in public.blocked_trade_patterns. Backup first if needed.
--
-- APPLY: Dashboard → SQL Editor → Run WITHOUT bulk RLS assist (same guidance as bundle).
--
-- Canonical shape after this matches: supabase/blocked_trade_patterns.sql
-- =============================================================================

DROP POLICY IF EXISTS "blocked_patterns_select_own" ON public.blocked_trade_patterns;
DROP POLICY IF EXISTS "blocked_patterns_insert_own" ON public.blocked_trade_patterns;
DROP POLICY IF EXISTS "blocked_patterns_update_own" ON public.blocked_trade_patterns;
DROP POLICY IF EXISTS "blocked_patterns_delete_own" ON public.blocked_trade_patterns;

DROP TABLE IF EXISTS public.blocked_trade_patterns CASCADE;

CREATE TABLE public.blocked_trade_patterns (
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

CREATE POLICY "blocked_patterns_select_own"
  ON public.blocked_trade_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "blocked_patterns_insert_own"
  ON public.blocked_trade_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "blocked_patterns_update_own"
  ON public.blocked_trade_patterns FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "blocked_patterns_delete_own"
  ON public.blocked_trade_patterns FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.blocked_trade_patterns IS
  'Strategy learner blocked patterns; replayed into PreTradeValidator on dashboard load.';
