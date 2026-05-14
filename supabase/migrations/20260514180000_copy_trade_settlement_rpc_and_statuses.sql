-- Copy-trade: expanded session statuses + atomic settlement RPC (single transaction, idempotent).

ALTER TABLE public.copy_trade_sessions DROP CONSTRAINT IF EXISTS copy_trade_sessions_status_check;

UPDATE public.copy_trade_sessions
SET status = 'settled'
WHERE status = 'closed';

ALTER TABLE public.copy_trade_sessions
  ADD CONSTRAINT copy_trade_sessions_status_check
  CHECK (
    status IN (
      'active',
      'pending_settlement',
      'settled',
      'force_closed',
      'failed_settlement',
      'archived'
    )
  );

CREATE OR REPLACE FUNCTION public.copy_trade_finalize_settlement_v1(
  p_session_id uuid,
  p_user_id uuid,
  p_main_credit numeric,
  p_liquid_credit numeric,
  p_final_status text
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
BEGIN
  IF p_final_status NOT IN ('settled', 'force_closed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_final_status');
  END IF;

  IF coalesce(p_main_credit, -1) < 0 OR coalesce(p_liquid_credit, -1) < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'negative_credit');
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

  SELECT round(ub.available_balance::numeric, 2), round(ub.container_withdrawable_earnings::numeric, 2)
  INTO v_avail, v_liquid
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', p_final_status,
    'available_balance', v_avail,
    'container_withdrawable_earnings', v_liquid
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.copy_trade_finalize_settlement_v1(uuid, uuid, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_trade_finalize_settlement_v1(uuid, uuid, numeric, numeric, text) TO service_role;

COMMENT ON FUNCTION public.copy_trade_finalize_settlement_v1(uuid, uuid, numeric, numeric, text) IS
  'Atomically credits Nexus Main + container liquid, closes copy_trade_sessions (idempotent on terminal status).';
