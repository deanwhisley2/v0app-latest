-- Nexus Bot: signal codes, auto-trade grants, bot sessions, attendance streaks.

CREATE TABLE IF NOT EXISTS public.nexus_signal_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL CHECK (slot IN ('morning', 'evening')),
  code text NOT NULL,
  strategy_title text NOT NULL,
  confidence text NOT NULL DEFAULT 'High',
  duration_hours integer NOT NULL DEFAULT 12 CHECK (duration_hours > 0 AND duration_hours <= 720),
  window_opens_at timestamptz NOT NULL,
  window_closes_at timestamptz NOT NULL,
  published_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nexus_signal_codes_window_idx
  ON public.nexus_signal_codes (window_opens_at DESC, slot);

CREATE TABLE IF NOT EXISTS public.nexus_bot_auto_trade_grants (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES auth.users (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plan_key)
);

CREATE TABLE IF NOT EXISTS public.nexus_bot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_kind text NOT NULL CHECK (session_kind IN ('signal', 'auto')),
  plan_key text,
  signal_code_id uuid REFERENCES public.nexus_signal_codes (id),
  stake_usd numeric(18, 2) NOT NULL CHECK (stake_usd > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  strategy_title text,
  confidence text,
  ends_at timestamptz NOT NULL,
  settled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nexus_bot_sessions_user_active_idx
  ON public.nexus_bot_sessions (user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.user_attendance_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  last_visit_date date,
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak integer NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  total_visits integer NOT NULL DEFAULT 0 CHECK (total_visits >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nexus_signal_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_bot_auto_trade_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_attendance_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY nexus_bot_grants_select_own ON public.nexus_bot_auto_trade_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY nexus_bot_sessions_select_own ON public.nexus_bot_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_attendance_streaks_select_own ON public.user_attendance_streaks
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.nexus_signal_codes IS 'Admin-published morning/evening Nexus codes for member engagement.';
COMMENT ON TABLE public.nexus_bot_auto_trade_grants IS 'Per-user auto-trade plan unlocks (24h/7d/14d/30d).';
COMMENT ON TABLE public.nexus_bot_sessions IS 'Active signal or auto-trade visualization sessions (ledger via API).';
