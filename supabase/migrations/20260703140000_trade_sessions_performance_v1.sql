-- Trade session codes + performance points (separate from wallet ledger).

CREATE TABLE IF NOT EXISTS public.trade_code_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  generated_by uuid REFERENCES auth.users (id),
  trade_session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trade_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  session_name text NOT NULL,
  session_slot text NOT NULL DEFAULT 'morning',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'expired')),
  display_label text,
  registered_by uuid REFERENCES auth.users (id),
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_sessions_status_end_idx
  ON public.trade_sessions (status, end_at DESC);

ALTER TABLE public.trade_code_generations
  ADD CONSTRAINT trade_code_generations_session_fk
  FOREIGN KEY (trade_session_id) REFERENCES public.trade_sessions (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.user_performance_points (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  points bigint NOT NULL DEFAULT 0 CHECK (points >= 0),
  completed_sessions integer NOT NULL DEFAULT 0 CHECK (completed_sessions >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.performance_point_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  source text NOT NULL,
  session_reference uuid,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS performance_point_events_user_created_idx
  ON public.performance_point_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.performance_point_rules (
  rule_key text PRIMARY KEY,
  label text NOT NULL,
  points integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.performance_point_rules (rule_key, label, points, enabled)
VALUES
  ('daily_attendance', 'Daily platform visit', 5, true),
  ('session_join', 'Joined a valid trade session', 15, true),
  ('session_complete', 'Completed a trade session', 25, true),
  ('attendance_streak_7', '7-day attendance streak', 50, true),
  ('referral_milestone', 'Referral milestone', 100, true),
  ('community_assist', 'Community assistance', 20, true),
  ('education_achievement', 'Educational achievement', 30, true)
ON CONFLICT (rule_key) DO NOTHING;

ALTER TABLE public.nexus_bot_sessions
  ADD COLUMN IF NOT EXISTS trade_session_id uuid REFERENCES public.trade_sessions (id),
  ADD COLUMN IF NOT EXISTS display_phase text,
  ADD COLUMN IF NOT EXISTS profit_released_usd numeric(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_confirmed_at timestamptz;

ALTER TABLE public.nexus_bot_sessions DROP CONSTRAINT IF EXISTS nexus_bot_sessions_status_check;
ALTER TABLE public.nexus_bot_sessions ADD CONSTRAINT nexus_bot_sessions_status_check
  CHECK (status IN ('pending', 'running', 'active', 'completed', 'cancelled', 'expired'));

CREATE UNIQUE INDEX IF NOT EXISTS nexus_bot_sessions_user_trade_once_idx
  ON public.nexus_bot_sessions (user_id, trade_session_id)
  WHERE trade_session_id IS NOT NULL AND status IN ('pending', 'running', 'active');

ALTER TABLE public.trade_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_performance_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_point_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_performance_points_select_own ON public.user_performance_points
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY performance_point_events_select_own ON public.performance_point_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY trade_sessions_select_active ON public.trade_sessions
  FOR SELECT TO authenticated USING (status = 'active');

COMMENT ON TABLE public.user_performance_points IS 'Participation credits only — never withdrawable balance.';
COMMENT ON TABLE public.performance_point_events IS 'Append-only audit of performance point awards.';
