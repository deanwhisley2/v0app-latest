-- -----------------------------------------------------------------------------
-- Fixed trade early exit — cancelled_at on sessions (safe re-run)
-- -----------------------------------------------------------------------------

ALTER TABLE public.fixed_trade_sessions
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.fixed_trade_sessions.cancelled_at IS
  'Set when user exits before official lease end (cancelled_early) or ops closes session.';
