-- Session completion: unreleased earnings → container pocket; net principal → Nexus Main only.
-- Users move pocket → Main manually via /api/user/container-earnings transfer_to_main.

CREATE OR REPLACE FUNCTION public.fixed_trade_finalize_early_exit_v1(
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
  v_lease_end timestamptz;
  v_principal numeric;
  v_insurance numeric;
  v_gross numeric;
  v_cum numeric;
  v_unreleased numeric;
  v_agreement_penalty numeric;
  v_insurance_exit numeric;
  v_net_principal numeric;
  v_earnings_fee numeric;
  v_liquid_credit numeric;
  v_avail numeric;
  v_liquid numeric;
  v_stake numeric;
  v_tx text := gen_random_uuid()::text;
  v_rowcount int;
  v_release_fee_rate constant numeric := 0.01;
BEGIN
  PERFORM pg_advisory_xact_lock(920012, hashtext(p_session_id::text));

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
    s.cumulative_earnings_released_usd
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

  v_principal := internal_round_usd2(fts.principal_amount);
  v_insurance := internal_round_usd2(fts.insurance_fee_amount);

  v_lease_end := fts.created_at + (fts.fix_period_months::text || ' months')::interval;
  IF v_now >= v_lease_end THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'lease_ended',
      'lease_ends_at', v_lease_end
    );
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

  v_cum := internal_round_usd2(coalesce(fts.cumulative_earnings_released_usd, 0));

  IF v_cum > v_gross + 0.02 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'cumulative_release_exceeds_modeled',
      'cumulative_released_usd', v_cum,
      'total_modeled_earned_usd', v_gross
    );
  END IF;

  v_unreleased := internal_round_usd2(greatest(0::numeric, v_gross - v_cum));

  v_agreement_penalty := internal_round_usd2(v_principal * 0.10);
  v_insurance_exit := v_insurance;
  v_net_principal := internal_round_usd2(greatest(0::numeric, v_principal - v_agreement_penalty - v_insurance_exit));
  v_earnings_fee := internal_round_usd2(v_unreleased * v_release_fee_rate);
  v_liquid_credit := internal_round_usd2(greatest(0::numeric, v_unreleased - v_earnings_fee));

  SELECT ub.*
  INTO v_bal
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_row_missing');
  END IF;

  v_stake := internal_round_usd2(coalesce(v_bal.current_stake, 0));
  IF v_stake < v_principal - 0.01 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'stake_principal_mismatch',
      'current_stake', v_stake,
      'principal', v_principal
    );
  END IF;

  v_avail := internal_round_usd2(coalesce(v_bal.available_balance, 0) + v_net_principal);
  v_liquid := internal_round_usd2(coalesce(v_bal.container_withdrawable_earnings, 0) + v_liquid_credit);

  UPDATE public.user_balances ub
  SET
    available_balance = v_avail,
    current_stake = internal_round_usd2(v_stake - v_principal),
    container_withdrawable_earnings = v_liquid,
    lifetime_container_fees = internal_round_usd2(coalesce(ub.lifetime_container_fees, 0) + v_earnings_fee),
    last_updated = v_now
  WHERE ub.user_id = p_user_id;

  UPDATE public.fixed_trade_sessions s
  SET
    status = 'cancelled_early',
    cancelled_at = v_now,
    cumulative_earnings_released_usd = v_gross,
    last_earnings_release_at = coalesce(s.last_earnings_release_at, v_now)
  WHERE s.id = p_session_id
    AND s.user_id = p_user_id
    AND s.status = 'active';

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'fixed_trade_early_exit_session_update_lost';
  END IF;

  IF v_net_principal > 0 THEN
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
      'fixed_trade_early_exit_principal_to_main',
      'trade',
      v_net_principal,
      0,
      v_net_principal,
      'current_stake',
      'available_balance',
      'completed',
      v_tx,
      p_session_id,
      'user',
      p_user_id,
      'Early exit: net principal returned to Nexus Main (penalties on principal only).',
      jsonb_build_object(
        'principal_usd', v_principal,
        'agreement_penalty_usd', v_agreement_penalty,
        'insurance_exit_from_principal_usd', v_insurance_exit,
        'net_principal_returned_usd', v_net_principal
      )
    );
  END IF;

  IF v_unreleased > 0 THEN
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
      'fixed_trade_early_exit_earnings_liquid',
      'trade',
      v_unreleased,
      v_earnings_fee,
      v_liquid_credit,
      'fixed_session_release',
      'container_withdrawable_earnings',
      'completed',
      v_tx,
      p_session_id,
      'user',
      p_user_id,
      'Early exit: session earnings to pocket (1% release fee). Move to Nexus Main manually when ready.',
      jsonb_build_object(
        'session_earned_usd', v_unreleased,
        'earnings_fee_usd', v_earnings_fee,
        'liquid_credit_usd', v_liquid_credit
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'transaction_ref', v_tx,
    'principal_usd', v_principal,
    'agreement_penalty_usd', v_agreement_penalty,
    'insurance_exit_from_principal_usd', v_insurance_exit,
    'session_earned_usd', v_unreleased,
    'unreleased_earned_usd', v_unreleased,
    'total_modeled_earned_usd', v_gross,
    'cumulative_released_usd', v_cum,
    'net_principal_returned_usd', v_net_principal,
    'main_credit_usd', v_net_principal,
    'earnings_fee_usd', v_earnings_fee,
    'liquid_credit_usd', v_liquid_credit,
    'total_credited_to_main_usd', v_net_principal,
    'available_balance', v_avail,
    'container_withdrawable_earnings', v_liquid,
    'current_stake', internal_round_usd2(v_stake - v_principal)
  );
END;
$fn$;

COMMENT ON FUNCTION public.fixed_trade_finalize_early_exit_v1(uuid, uuid) IS
  'Early exit: net principal → Nexus Main; unreleased earnings (after 1% fee) → pocket. No auto pocket→Main.';

REVOKE ALL ON FUNCTION public.fixed_trade_finalize_early_exit_v1(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fixed_trade_finalize_early_exit_v1(uuid, uuid) TO service_role;
