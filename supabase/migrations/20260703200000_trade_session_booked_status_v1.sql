-- Pre-booking: explicit BOOKED status for trade sessions before scheduled start.

ALTER TABLE public.nexus_bot_sessions DROP CONSTRAINT IF EXISTS nexus_bot_sessions_status_check;
ALTER TABLE public.nexus_bot_sessions ADD CONSTRAINT nexus_bot_sessions_status_check
  CHECK (status IN ('booked', 'ready', 'pending', 'running', 'active', 'completed', 'cancelled', 'expired'));

UPDATE public.nexus_bot_sessions
SET status = 'booked', display_phase = 'booked'
WHERE trade_session_id IS NOT NULL AND status = 'ready';

DROP INDEX IF EXISTS nexus_bot_sessions_user_trade_once_idx;
CREATE UNIQUE INDEX IF NOT EXISTS nexus_bot_sessions_user_trade_once_idx
  ON public.nexus_bot_sessions (user_id, trade_session_id)
  WHERE trade_session_id IS NOT NULL AND status IN ('booked', 'ready', 'pending', 'running', 'active');

COMMENT ON COLUMN public.nexus_bot_sessions.status IS
  'Trade session bot lifecycle: booked (pre-start reservation) → running → completed.';
