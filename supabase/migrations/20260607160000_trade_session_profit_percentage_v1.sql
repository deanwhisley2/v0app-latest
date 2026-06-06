-- Trade session profit percentage: admin-assigned earnings model per session/participant.

ALTER TABLE public.trade_sessions
  ADD COLUMN IF NOT EXISTS profit_mode text NOT NULL DEFAULT 'fixed'
    CHECK (profit_mode IN ('fixed', 'range')),
  ADD COLUMN IF NOT EXISTS profit_percentage numeric(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS profit_pct_min numeric(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS profit_pct_max numeric(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS profit_percentage_locked_at timestamptz NULL;

COMMENT ON COLUMN public.trade_sessions.profit_mode IS
  'fixed = same % for all participants; range = random % per participant between min/max at join.';
COMMENT ON COLUMN public.trade_sessions.profit_percentage IS
  'Fixed-mode profit percentage (e.g. 3.50 = 3.5% of participant capital).';
COMMENT ON COLUMN public.trade_sessions.profit_pct_min IS 'Range-mode minimum profit percentage.';
COMMENT ON COLUMN public.trade_sessions.profit_pct_max IS 'Range-mode maximum profit percentage.';
COMMENT ON COLUMN public.trade_sessions.profit_percentage_locked_at IS
  'Set when first participant joins; profit config becomes immutable.';

CREATE TABLE IF NOT EXISTS public.session_participant_profit_percentages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.trade_sessions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  profit_percentage numeric(5, 2) NOT NULL CHECK (profit_percentage >= 0 AND profit_percentage <= 100),
  capital_at_join_usd numeric(18, 2) NOT NULL CHECK (capital_at_join_usd >= 0),
  participation_weight numeric(8, 6) NOT NULL DEFAULT 1 CHECK (participation_weight >= 0 AND participation_weight <= 1),
  assigned_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT session_participant_profit_percentages_session_user_unique UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS session_participant_profit_pct_user_idx
  ON public.session_participant_profit_percentages (user_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS session_participant_profit_pct_session_idx
  ON public.session_participant_profit_percentages (session_id);

ALTER TABLE public.session_participant_profit_percentages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.session_participant_profit_percentages IS
  'Per-participant profit % assigned at trade-session join; settlement reads this row only.';

REVOKE ALL ON TABLE public.session_participant_profit_percentages FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.session_participant_profit_percentages TO service_role;

-- Ops/support audit: one query explains why a user earned what they did.
CREATE OR REPLACE VIEW public.trade_session_earnings_audit_v1
WITH (security_invoker = true)
AS
SELECT
  spp.user_id,
  spp.session_id AS trade_session_id,
  ts.code AS trade_session_code,
  ts.session_name,
  ts.profit_mode,
  ts.profit_percentage AS session_fixed_profit_percentage,
  ts.profit_pct_min AS session_profit_pct_min,
  ts.profit_pct_max AS session_profit_pct_max,
  spp.profit_percentage AS participant_profit_percentage_used,
  spp.capital_at_join_usd,
  spp.participation_weight,
  round(spp.capital_at_join_usd * spp.profit_percentage / 100.0 * spp.participation_weight, 2) AS expected_profit_usd,
  nbs.id AS bot_session_id,
  nbs.profit_released_usd AS settled_profit_usd,
  nbs.status AS bot_session_status,
  nbs.settled_at,
  spp.assigned_at
FROM public.session_participant_profit_percentages spp
JOIN public.trade_sessions ts ON ts.id = spp.session_id
LEFT JOIN public.nexus_bot_sessions nbs
  ON nbs.trade_session_id = spp.session_id AND nbs.user_id = spp.user_id;

REVOKE ALL ON public.trade_session_earnings_audit_v1 FROM PUBLIC;
GRANT SELECT ON public.trade_session_earnings_audit_v1 TO service_role;
