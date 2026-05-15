-- Fixed-trade earnings release: remove 5-day windows and period % slices.
-- Users may release all unreleased accrued gross (policy headroom) in one action.

CREATE OR REPLACE FUNCTION public.fixed_trade_calculate_withdrawable_v1(p_session_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  fts record;
  v_now timestamptz := timezone('utc', now());
  v_gross numeric;
  v_cum numeric;
  v_headroom numeric;
  v_to_release numeric;
BEGIN
  SELECT
    s.id,
    s.user_id,
    s.status,
    s.principal_amount,
    s.insurance_fee_amount,
    s.fix_period_months,
    s.seed_key,
    s.created_at,
    s.metadata,
    s.cumulative_earnings_released_usd,
    s.last_earnings_release_at
  INTO fts
  FROM public.fixed_trade_sessions s
  WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  IF fts.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF fts.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_active', 'status', fts.status);
  END IF;

  v_gross := internal_fixed_trade_policy_gross_usd(
    fts.metadata,
    fts.principal_amount,
    fts.insurance_fee_amount,
    fts.fix_period_months::int,
    coalesce(fts.seed_key, ''),
    fts.id,
    fts.created_at,
    v_now
  );

  v_cum := round(coalesce(fts.cumulative_earnings_released_usd, 0)::numeric, 2);
  v_headroom := round(greatest(0::numeric, v_gross - v_cum)::numeric, 2);
  v_to_release := v_headroom;

  RETURN jsonb_build_object(
    'ok', true,
    'window_open', v_headroom > 0,
    'current_accrued_gross_usd', v_gross,
    'cumulative_released_gross_usd', v_cum,
    'headroom_usd', v_headroom,
    'withdrawable_gross_usd', v_to_release,
    'release_fee_rate', 0.01,
    'last_release_at', fts.last_earnings_release_at
  );
END;
$fn$;

COMMENT ON FUNCTION public.fixed_trade_calculate_withdrawable_v1(uuid, uuid) IS
  'Server-only fixed-trade withdrawable preview: full unreleased policy headroom (no calendar or % slice).';

CREATE OR REPLACE FUNCTION public.fixed_trade_release_earnings_window_v1(
  p_session_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  fts record;
  v_bal record;
  v_now timestamptz := timezone('utc', now());
  v_gross numeric;
  v_cum numeric;
  v_headroom numeric;
  v_to_release numeric;
  v_fee numeric;
  v_liq numeric;
  v_next_cum numeric;
  v_prev_liquid numeric;
  v_next_liquid numeric;
  v_tx text := gen_random_uuid()::text;
  v_avail numeric;
  v_rowcount int;
BEGIN
  PERFORM pg_advisory_xact_lock(920011, hashtext(p_session_id::text));

  SELECT
    s.id,
    s.user_id,
    s.status,
    s.principal_amount,
    s.insurance_fee_amount,
    s.fix_period_months,
    s.seed_key,
    s.created_at,
    s.metadata,
    s.cumulative_earnings_released_usd,
    s.last_earnings_release_at
  INTO fts
  FROM public.fixed_trade_sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  IF fts.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF fts.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_active', 'status', fts.status);
  END IF;

  v_gross := internal_fixed_trade_policy_gross_usd(
    fts.metadata,
    fts.principal_amount,
    fts.insurance_fee_amount,
    fts.fix_period_months::int,
    coalesce(fts.seed_key, ''),
    fts.id,
    fts.created_at,
    v_now
  );

  IF NOT (v_gross > 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_accrual_yet');
  END IF;

  v_cum := round(coalesce(fts.cumulative_earnings_released_usd, 0)::numeric, 2);
  v_headroom := round(greatest(0::numeric, v_gross - v_cum)::numeric, 2);

  IF NOT (v_headroom > 0) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'headroom_exhausted',
      'policy_gross_usd', v_gross,
      'cumulative_released_usd', v_cum
    );
  END IF;

  v_to_release := v_headroom;

  v_fee := round((v_to_release * 0.01)::numeric, 2);
  v_liq := round((v_to_release - v_fee)::numeric, 2);
  IF v_liq < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'negative_net_liquid');
  END IF;

  v_next_cum := round((v_cum + v_to_release)::numeric, 2);

  SELECT ub.*
  INTO v_bal
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_row_missing');
  END IF;

  v_prev_liquid := round(coalesce(v_bal.container_withdrawable_earnings, 0)::numeric, 2);
  v_next_liquid := round((v_prev_liquid + v_liq)::numeric, 2);

  UPDATE public.user_balances ub
  SET
    container_withdrawable_earnings = v_next_liquid,
    last_updated = v_now
  WHERE ub.user_id = p_user_id;

  UPDATE public.fixed_trade_sessions s
  SET
    cumulative_earnings_released_usd = v_next_cum,
    last_earnings_release_at = v_now
  WHERE s.id = p_session_id
    AND s.user_id = p_user_id
    AND s.status = 'active';

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'fixed_trade_release_session_update_lost';
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
    'fixed_trade_earnings_to_container_liquid',
    'container',
    v_to_release,
    v_fee,
    v_liq,
    'fixed_trade_session_accrual',
    'container_withdrawable_earnings',
    'completed',
    v_tx,
    p_session_id::text,
    'user',
    p_user_id::text,
    format(
      'Fixed-trade earnings released to container liquid (%s USD net of 1.0%% release fee).',
      v_liq
    ),
    jsonb_build_object(
      'gross_released_usd', v_to_release,
      'fee_rate', 0.01,
      'fix_period_months', fts.fix_period_months,
      'release_mode', 'full_headroom',
      'pair_ref', v_tx
    )
  );

  SELECT round(ub.available_balance::numeric, 2),
    round(ub.container_withdrawable_earnings::numeric, 2)
  INTO v_avail, v_next_liquid
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'released_gross_usd', v_to_release,
    'fee_usd', v_fee,
    'credited_liquid_usd', v_liq,
    'cumulative_released_usd', v_next_cum,
    'policy_gross_usd', v_gross,
    'available_balance', v_avail,
    'container_withdrawable_earnings', v_next_liquid,
    'transaction_ref', v_tx
  );
END;
$fn$;

COMMENT ON FUNCTION public.fixed_trade_release_earnings_window_v1(uuid, uuid) IS
  'Atomically releases all unreleased fixed-trade accrued gross into container_withdrawable_earnings (1%% release fee).';
