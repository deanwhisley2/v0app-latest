-- Fixed-trade terminal maturity: statuses, tracking columns, atomic RPC + in-transaction audit rows.

ALTER TABLE public.fixed_trade_sessions DROP CONSTRAINT IF EXISTS fixed_trade_sessions_status_check;

ALTER TABLE public.fixed_trade_sessions
  ADD CONSTRAINT fixed_trade_sessions_status_check
  CHECK (
    status IN (
      'active',
      'completed',
      'matured',
      'pending_settlement',
      'failed_settlement',
      'archived',
      'cancelled_early',
      'emergency_closed'
    )
  );

ALTER TABLE public.fixed_trade_sessions
  ADD COLUMN IF NOT EXISTS maturity_settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS maturity_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maturity_next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS maturity_last_error TEXT;

COMMENT ON COLUMN public.fixed_trade_sessions.maturity_settled_at IS
  'Idempotent maturity settlement timestamp — principal + terminal earnings applied once.';
COMMENT ON COLUMN public.fixed_trade_sessions.maturity_attempts IS
  'Cron/worker attempts; exponential backoff via maturity_next_retry_at; DLQ via status failed_settlement.';
COMMENT ON COLUMN public.fixed_trade_sessions.maturity_next_retry_at IS
  'Do not process maturity before this time (after transient failures).';

CREATE INDEX IF NOT EXISTS fixed_trade_sessions_maturity_worker_idx
  ON public.fixed_trade_sessions (status, maturity_settled_at, maturity_next_retry_at, created_at)
  WHERE status = 'active' AND maturity_settled_at IS NULL;

CREATE OR REPLACE FUNCTION public.fixed_trade_finalize_maturity_v1(
  p_session_id uuid,
  p_user_id uuid,
  p_final_gross_usd numeric,
  p_remainder_gross_usd numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  fts record;
  v_bal record;
  v_lease_end timestamptz;
  v_principal numeric(15, 2);
  v_cum numeric(15, 2);
  v_final numeric(15, 2);
  v_rem numeric(15, 2);
  v_fee numeric(15, 2);
  v_liq numeric(15, 2);
  v_cap numeric(15, 2);
  v_rowcount int;
  v_tx text := gen_random_uuid()::text;
  v_avail numeric(15, 2);
  v_stake numeric(15, 2);
  v_liquid_bal numeric(15, 2);
BEGIN
  IF coalesce(p_final_gross_usd, -1) < 0 OR coalesce(p_remainder_gross_usd, -1) < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'negative_amount');
  END IF;

  SELECT
    fts0.id,
    fts0.user_id,
    fts0.status,
    fts0.principal_amount,
    fts0.cumulative_earnings_released_usd,
    fts0.created_at,
    fts0.fix_period_months,
    fts0.maturity_settled_at,
    fts0.metadata
  INTO fts
  FROM public.fixed_trade_sessions fts0
  WHERE fts0.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  IF fts.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF fts.status IN ('failed_settlement', 'cancelled_early', 'emergency_closed', 'pending_settlement') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_matureable', 'status', fts.status);
  END IF;

  IF fts.maturity_settled_at IS NOT NULL OR fts.status IN ('matured', 'completed', 'archived') THEN
    SELECT ub.available_balance, ub.current_stake, ub.container_withdrawable_earnings
    INTO v_avail, v_stake, v_liquid_bal
    FROM public.user_balances ub
    WHERE ub.user_id = p_user_id;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', fts.status,
      'available_balance', coalesce(round(v_avail::numeric, 2), 0),
      'current_stake', coalesce(round(v_stake::numeric, 2), 0),
      'container_withdrawable_earnings', coalesce(round(v_liquid_bal::numeric, 2), 0)
    );
  END IF;

  IF fts.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session_state', 'status', fts.status);
  END IF;

  v_lease_end := fts.created_at + (fts.fix_period_months::text || ' months')::interval;
  IF timezone('utc', now()) < v_lease_end THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lease_not_ended', 'lease_ends_at', v_lease_end);
  END IF;

  v_principal := round(coalesce(fts.principal_amount, 0)::numeric, 2);
  v_cum := round(coalesce(fts.cumulative_earnings_released_usd, 0)::numeric, 2);
  v_final := round(p_final_gross_usd::numeric, 2);
  v_rem := round(p_remainder_gross_usd::numeric, 2);

  IF v_rem > v_final + 0.02 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remainder_exceeds_final_gross');
  END IF;

  IF abs((v_cum + v_rem) - v_final) > 0.02 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'release_reconcile_mismatch',
      'cumulative', v_cum,
      'remainder', v_rem,
      'final', v_final
    );
  END IF;

  BEGIN
    v_cap := nullif(trim(fts.metadata -> 'lifecycle' ->> 'targetProfitUsd'), '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_cap := null;
  END;

  IF v_cap IS NOT NULL AND v_final > round(v_cap, 2) + 0.02 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'final_gross_above_lifecycle_cap', 'cap', v_cap, 'final', v_final);
  END IF;

  v_fee := round(v_rem * 0.01, 2);
  v_liq := round(v_rem - v_fee, 2);
  IF v_liq < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'negative_net_liquid');
  END IF;

  SELECT ub.*
  INTO v_bal
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_row_missing');
  END IF;

  IF round(coalesce(v_bal.current_stake, 0)::numeric, 2) < v_principal THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_stake_for_principal', 'current_stake', v_bal.current_stake);
  END IF;

  UPDATE public.user_balances ub
  SET
    available_balance = round((coalesce(ub.available_balance, 0) + v_principal)::numeric, 2),
    current_stake = round((coalesce(ub.current_stake, 0) - v_principal)::numeric, 2),
    container_withdrawable_earnings = round((coalesce(ub.container_withdrawable_earnings, 0) + v_liq)::numeric, 2),
    last_updated = timezone('utc', now())
  WHERE ub.user_id = p_user_id;

  UPDATE public.fixed_trade_sessions s
  SET
    status = 'matured',
    maturity_settled_at = timezone('utc', now()),
    cumulative_earnings_released_usd = v_final,
    maturity_last_error = null,
    maturity_next_retry_at = null
  WHERE s.id = p_session_id
    AND s.user_id = p_user_id
    AND s.status = 'active'
    AND s.maturity_settled_at IS NULL;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'fixed_trade_maturity_claim_lost';
  END IF;

  INSERT INTO public.container_balance_events (
    user_id,
    event_type,
    category,
    gross_amount,
    fee_amount,
    net_amount,
    balance_source,
    balance_destination,
    status,
    transaction_ref,
    related_trade_id,
    actor_type,
    actor_id,
    summary,
    metadata
  )
  VALUES (
    p_user_id,
    'fixed_trade_maturity_principal_to_main',
    'trade',
    v_principal,
    0,
    v_principal,
    'current_stake',
    'available_balance',
    'completed',
    v_tx,
    p_session_id::text,
    'system',
    p_user_id::text,
    'Fixed-trade maturity: protected principal returned to Nexus Main.',
    jsonb_build_object('session_id', p_session_id, 'principal_usd', v_principal, 'pair_ref', v_tx)
  );

  INSERT INTO public.container_balance_events (
    user_id,
    event_type,
    category,
    gross_amount,
    fee_amount,
    net_amount,
    balance_source,
    balance_destination,
    status,
    transaction_ref,
    related_trade_id,
    actor_type,
    actor_id,
    summary,
    metadata
  )
  VALUES (
    p_user_id,
    'fixed_trade_maturity_terminal_earnings_liquid',
    'trade',
    v_rem,
    v_fee,
    v_liq,
    'fixed_trade_session_maturity',
    'container_withdrawable_earnings',
    'completed',
    v_tx,
    p_session_id::text,
    'system',
    p_user_id::text,
    'Fixed-trade maturity: remaining gross earnings to container liquid (1% release fee on terminal slice).',
    jsonb_build_object(
      'session_id',
      p_session_id,
      'remainder_gross_usd',
      v_rem,
      'fee_usd',
      v_fee,
      'credited_liquid_net_usd',
      v_liq,
      'final_policy_gross_usd',
      v_final,
      'pair_ref',
      v_tx
    )
  );

  SELECT round(ub.available_balance::numeric, 2),
    round(ub.current_stake::numeric, 2),
    round(ub.container_withdrawable_earnings::numeric, 2)
  INTO v_avail, v_stake, v_liquid_bal
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'matured',
    'principal_returned_usd', v_principal,
    'terminal_gross_usd', v_rem,
    'terminal_fee_usd', v_fee,
    'terminal_liquid_net_usd', v_liq,
    'final_policy_gross_usd', v_final,
    'available_balance', v_avail,
    'current_stake', v_stake,
    'container_withdrawable_earnings', v_liquid_bal,
    'transaction_ref', v_tx
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.fixed_trade_finalize_maturity_v1(uuid, uuid, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fixed_trade_finalize_maturity_v1(uuid, uuid, numeric, numeric) TO service_role;

COMMENT ON FUNCTION public.fixed_trade_finalize_maturity_v1(uuid, uuid, numeric, numeric) IS
  'Atomically returns fixed principal to Nexus Main, credits terminal net earnings to container liquid, closes session (matured), appends audit rows.';
