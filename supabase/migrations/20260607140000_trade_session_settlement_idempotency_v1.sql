-- Trade-session settlement idempotency: DB must reject duplicate payout attempts.

CREATE TABLE IF NOT EXISTS public.trade_session_settlement_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  user_id uuid NOT NULL,
  bot_session_id uuid NOT NULL REFERENCES public.nexus_bot_sessions (id) ON DELETE CASCADE,
  settlement_kind text NOT NULL CHECK (settlement_kind IN ('complete', 'reconcile_topup', 'cancel')),
  amount_usd numeric(18, 2) NOT NULL CHECK (amount_usd >= 0),
  ledger_event_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT trade_session_settlement_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT trade_session_settlement_idem_session_user_kind_amount
    UNIQUE (bot_session_id, user_id, settlement_kind, amount_usd)
);

CREATE INDEX IF NOT EXISTS trade_session_settlement_idem_user_idx
  ON public.trade_session_settlement_idempotency (user_id, created_at DESC);

ALTER TABLE public.trade_session_settlement_idempotency ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.trade_session_settlement_idempotency IS
  'One row per successful trade-session settlement credit (complete, reconcile_topup, cancel). Rejects duplicate payout attempts at the database.';

REVOKE ALL ON TABLE public.trade_session_settlement_idempotency FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trade_session_settlement_idempotency TO service_role;

-- Backfill idempotency from existing terminal ledger rows (prevents re-credit on repair replay).
INSERT INTO public.trade_session_settlement_idempotency (
  idempotency_key,
  user_id,
  bot_session_id,
  settlement_kind,
  amount_usd,
  ledger_event_id
)
SELECT DISTINCT ON (cbe.related_session_id, cbe.user_id, cbe.event_type, cbe.gross_amount)
  CASE
    WHEN cbe.event_type = 'nexus_trade_session_complete' THEN 'complete:' || cbe.related_session_id::text
    WHEN cbe.event_type = 'nexus_trade_session_reconcile_topup' THEN
      'topup:' || cbe.related_session_id::text || ':' || cbe.gross_amount::text
    ELSE 'cancel:' || cbe.related_session_id::text
  END,
  cbe.user_id,
  cbe.related_session_id::uuid,
  CASE
    WHEN cbe.event_type = 'nexus_trade_session_complete' THEN 'complete'
    WHEN cbe.event_type = 'nexus_trade_session_reconcile_topup' THEN 'reconcile_topup'
    ELSE 'cancel'
  END,
  cbe.gross_amount,
  cbe.id
FROM public.container_balance_events cbe
WHERE cbe.related_session_id IS NOT NULL
  AND cbe.event_type IN (
    'nexus_trade_session_complete',
    'nexus_trade_session_reconcile_topup',
    'nexus_trade_session_cancel'
  )
ORDER BY cbe.related_session_id, cbe.user_id, cbe.event_type, cbe.gross_amount, cbe.created_at ASC
ON CONFLICT DO NOTHING;
