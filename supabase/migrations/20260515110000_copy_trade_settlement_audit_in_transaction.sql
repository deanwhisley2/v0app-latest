-- Copy-trade settlement: in-transaction audit rows (container_balance_events) matching fixed maturity pattern.

DROP FUNCTION IF EXISTS public.copy_trade_finalize_settlement_v1(uuid, uuid, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.copy_trade_finalize_settlement_v1(
  p_session_id uuid,
  p_user_id uuid,
  p_main_credit numeric,
  p_liquid_credit numeric,
  p_final_status text,
  p_audit_principal_gross_usd numeric,
  p_audit_principal_fee_usd numeric,
  p_audit_earnings_gross_usd numeric,
  p_audit_earnings_fee_usd numeric,
  p_actor_type text DEFAULT 'user'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_session record;
  v_balance_user uuid;
  v_avail numeric(15, 2);
  v_liquid numeric(15, 2);
  v_rowcount int;
  v_tx text := gen_random_uuid()::text;
  v_principal_net numeric(15, 2);
  v_earnings_net numeric(15, 2);
  v_actor text;
BEGIN
  v_actor := coalesce(nullif(trim(p_actor_type), ''), 'user');
  IF v_actor NOT IN ('user', 'system', 'admin', 'bot', 'retailer') THEN
    v_actor := 'user';
  END IF;

  IF p_final_status NOT IN ('settled', 'force_closed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_final_status');
  END IF;

  IF coalesce(p_main_credit, -1) < 0 OR coalesce(p_liquid_credit, -1) < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'negative_credit');
  END IF;

  IF coalesce(p_audit_principal_gross_usd, -1) < 0
     OR coalesce(p_audit_principal_fee_usd, -1) < 0
     OR coalesce(p_audit_earnings_gross_usd, -1) < 0
     OR coalesce(p_audit_earnings_fee_usd, -1) < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'negative_audit_component');
  END IF;

  v_principal_net := round((p_audit_principal_gross_usd - p_audit_principal_fee_usd)::numeric, 2);
  v_earnings_net := round((p_audit_earnings_gross_usd - p_audit_earnings_fee_usd)::numeric, 2);

  IF abs(v_principal_net - round(p_main_credit::numeric, 2)) > 0.02 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'audit_principal_mismatch_main_credit');
  END IF;

  IF abs(v_earnings_net - round(p_liquid_credit::numeric, 2)) > 0.02 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'audit_earnings_mismatch_liquid_credit');
  END IF;

  SELECT id, user_id, status, settled_at
  INTO v_session
  FROM public.copy_trade_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  IF v_session.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_session.status IN ('settled', 'force_closed', 'archived') THEN
    SELECT ub.available_balance, ub.container_withdrawable_earnings
    INTO v_avail, v_liquid
    FROM public.user_balances ub
    WHERE ub.user_id = p_user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', v_session.status,
      'available_balance', coalesce(round(v_avail::numeric, 2), 0),
      'container_withdrawable_earnings', coalesce(round(v_liquid::numeric, 2), 0)
    );
  END IF;

  IF v_session.status IS DISTINCT FROM 'active' OR v_session.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_session_state',
      'status', v_session.status
    );
  END IF;

  SELECT ub.user_id
  INTO v_balance_user
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_row_missing');
  END IF;

  UPDATE public.user_balances ub
  SET
    available_balance = round((coalesce(ub.available_balance, 0) + p_main_credit)::numeric, 2),
    container_withdrawable_earnings = round((coalesce(ub.container_withdrawable_earnings, 0) + p_liquid_credit)::numeric, 2),
    last_updated = timezone('utc', now())
  WHERE ub.user_id = p_user_id;

  UPDATE public.copy_trade_sessions cts
  SET
    settled_at = timezone('utc', now()),
    closed_at = timezone('utc', now()),
    status = p_final_status
  WHERE cts.id = p_session_id
    AND cts.user_id = p_user_id
    AND cts.status = 'active'
    AND cts.settled_at IS NULL;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'copy_trade_settlement_claim_lost';
  END IF;

  INSERT INTO public.container_balance_events (
    user_id, event_type, category, gross_amount, fee_amount, net_amount,
    balance_source, balance_destination, status, transaction_ref, related_trade_id,
    actor_type, actor_id, summary, metadata
  ) VALUES (
    p_user_id,
    'copy_trade_settlement_principal_to_main',
    'trade',
    round(p_audit_principal_gross_usd::numeric, 2),
    round(p_audit_principal_fee_usd::numeric, 2),
    v_principal_net,
    'copy_trade_session_lock',
    'available_balance',
    'completed',
    v_tx,
    p_session_id::text,
    v_actor,
    p_user_id::text,
    'Copy-trade settlement: principal / Nexus Main attribution (session close).',
    jsonb_build_object('session_id', p_session_id, 'final_status', p_final_status, 'pair_ref', v_tx, 'leg', 'principal_main')
  );

  INSERT INTO public.container_balance_events (
    user_id, event_type, category, gross_amount, fee_amount, net_amount,
    balance_source, balance_destination, status, transaction_ref, related_trade_id,
    actor_type, actor_id, summary, metadata
  ) VALUES (
    p_user_id,
    'copy_trade_settlement_earnings_to_liquid',
    'trade',
    round(p_audit_earnings_gross_usd::numeric, 2),
    round(p_audit_earnings_fee_usd::numeric, 2),
    v_earnings_net,
    'copy_trade_session_lock',
    'container_withdrawable_earnings',
    'completed',
    v_tx,
    p_session_id::text,
    v_actor,
    p_user_id::text,
    'Copy-trade settlement: gross earnings to container liquid (fees applied per policy leg).',
    jsonb_build_object('session_id', p_session_id, 'final_status', p_final_status, 'pair_ref', v_tx, 'leg', 'earnings_liquid')
  );

  SELECT round(ub.available_balance::numeric, 2), round(ub.container_withdrawable_earnings::numeric, 2)
  INTO v_avail, v_liquid
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', p_final_status,
    'available_balance', v_avail,
    'container_withdrawable_earnings', v_liquid,
    'transaction_ref', v_tx
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.copy_trade_finalize_settlement_v1(uuid, uuid, numeric, numeric, text, numeric, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_trade_finalize_settlement_v1(uuid, uuid, numeric, numeric, text, numeric, numeric, numeric, numeric, text) TO service_role;

COMMENT ON FUNCTION public.copy_trade_finalize_settlement_v1(uuid, uuid, numeric, numeric, text, numeric, numeric, numeric, numeric, text) IS
  'Atomically settles copy_trade_sessions, credits balances, appends two container_balance_events (Main + liquid legs). Idempotent on terminal status.';
