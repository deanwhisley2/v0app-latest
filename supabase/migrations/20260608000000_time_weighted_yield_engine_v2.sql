-- Nexus Time-Weighted Yield Engine v2 — single earnings authority for trade sessions.

ALTER TABLE public.trade_sessions
  ADD COLUMN IF NOT EXISTS max_yield_percent numeric(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS yield_distribution_mode text NOT NULL DEFAULT 'LINEAR_TIME_WEIGHTED'
    CHECK (yield_distribution_mode IN ('LINEAR_TIME_WEIGHTED'));

COMMENT ON COLUMN public.trade_sessions.max_yield_percent IS
  'Maximum session yield % (early birds). Late entrants earn pro-rated by remaining session time.';
COMMENT ON COLUMN public.trade_sessions.yield_distribution_mode IS
  'Yield distribution algorithm. v2 uses LINEAR_TIME_WEIGHTED only.';

-- Extend participant store (canonical yield record per join).
ALTER TABLE public.session_participant_profit_percentages
  ADD COLUMN IF NOT EXISTS effective_start_time timestamptz NULL,
  ADD COLUMN IF NOT EXISTS participation_ratio numeric(10, 6) NULL,
  ADD COLUMN IF NOT EXISTS earned_percent numeric(10, 4) NULL,
  ADD COLUMN IF NOT EXISTS expected_profit_usd numeric(18, 2) NULL,
  ADD COLUMN IF NOT EXISTS is_early_bird boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS settled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz NULL;

CREATE TABLE IF NOT EXISTS public.yield_calculation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.trade_sessions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  join_time timestamptz NOT NULL,
  effective_start timestamptz NOT NULL,
  max_yield_percent numeric(5, 2) NOT NULL,
  earned_percent numeric(10, 4) NOT NULL,
  profit_usd numeric(18, 2) NOT NULL,
  calculation_hash text NULL,
  calculated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS yield_calculation_audit_session_idx
  ON public.yield_calculation_audit (session_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS yield_calculation_audit_user_idx
  ON public.yield_calculation_audit (user_id, calculated_at DESC);

ALTER TABLE public.yield_calculation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.yield_calculation_audit FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.yield_calculation_audit TO service_role;

CREATE TABLE IF NOT EXISTS public.session_join_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  session_id uuid NOT NULL REFERENCES public.trade_sessions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT session_join_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS session_join_idempotency_session_user_idx
  ON public.session_join_idempotency (session_id, user_id);

ALTER TABLE public.session_join_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.session_join_idempotency FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.session_join_idempotency TO service_role;

-- Ops view: one query explains any user's earnings.
CREATE OR REPLACE VIEW public.user_earnings_explanation_v1
WITH (security_invoker = true)
AS
SELECT
  spp.user_id,
  ts.id AS session_id,
  ts.code AS trade_session_code,
  ts.max_yield_percent,
  ts.start_at AS session_start,
  ts.end_at AS session_end,
  spp.assigned_at AS joined_at,
  spp.effective_start_time,
  spp.participation_ratio,
  coalesce(spp.earned_percent, spp.profit_percentage) AS earned_percent,
  spp.capital_at_join_usd,
  coalesce(spp.expected_profit_usd, round(spp.capital_at_join_usd * spp.profit_percentage / 100.0 * spp.participation_weight, 2)) AS expected_profit_usd,
  spp.is_early_bird,
  nbs.profit_released_usd AS settled_profit_usd,
  nbs.status AS bot_session_status,
  spp.settled,
  spp.settled_at,
  CASE
    WHEN spp.assigned_at <= ts.start_at THEN 'EARLY_BIRD — Full max yield'
    WHEN spp.assigned_at > ts.end_at THEN 'REJECTED — Joined after end'
    ELSE 'LATE_ENTRY — Time-pro-rated yield'
  END AS earnings_explanation
FROM public.session_participant_profit_percentages spp
JOIN public.trade_sessions ts ON ts.id = spp.session_id
LEFT JOIN public.nexus_bot_sessions nbs
  ON nbs.trade_session_id = spp.session_id AND nbs.user_id = spp.user_id;

REVOKE ALL ON public.user_earnings_explanation_v1 FROM PUBLIC;
GRANT SELECT ON public.user_earnings_explanation_v1 TO service_role;

-- Backfill max_yield from legacy fixed profit_percentage where set.
UPDATE public.trade_sessions
SET max_yield_percent = profit_percentage
WHERE max_yield_percent IS NULL
  AND profit_percentage IS NOT NULL
  AND profit_percentage > 0;
