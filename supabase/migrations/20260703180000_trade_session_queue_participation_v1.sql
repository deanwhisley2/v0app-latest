-- Trade session queue (READY), participation weighting, verification records.

CREATE TABLE IF NOT EXISTS public.trade_session_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  trade_session_id uuid NOT NULL REFERENCES public.trade_sessions (id) ON DELETE CASCADE,
  code text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS trade_session_verifications_user_session_open_idx
  ON public.trade_session_verifications (user_id, trade_session_id)
  WHERE consumed_at IS NULL;

ALTER TABLE public.nexus_bot_sessions
  ADD COLUMN IF NOT EXISTS code_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS participation_weight numeric(8, 6) DEFAULT 1
    CHECK (participation_weight >= 0 AND participation_weight <= 1),
  ADD COLUMN IF NOT EXISTS profit_celebrated_at timestamptz;

ALTER TABLE public.nexus_bot_sessions DROP CONSTRAINT IF EXISTS nexus_bot_sessions_status_check;
ALTER TABLE public.nexus_bot_sessions ADD CONSTRAINT nexus_bot_sessions_status_check
  CHECK (status IN ('ready', 'pending', 'running', 'active', 'completed', 'cancelled', 'expired'));

DROP INDEX IF EXISTS nexus_bot_sessions_user_trade_once_idx;
CREATE UNIQUE INDEX IF NOT EXISTS nexus_bot_sessions_user_trade_once_idx
  ON public.nexus_bot_sessions (user_id, trade_session_id)
  WHERE trade_session_id IS NOT NULL AND status IN ('ready', 'pending', 'running', 'active');

ALTER TABLE public.trade_session_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY trade_session_verifications_select_own ON public.trade_session_verifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

COMMENT ON COLUMN public.nexus_bot_sessions.participation_weight IS
  'Proportional session allocation based on join timing vs session window.';
