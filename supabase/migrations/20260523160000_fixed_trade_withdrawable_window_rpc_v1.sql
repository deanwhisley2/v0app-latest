-- Fixed-trade partial earnings: server-only withdrawable math + rolling 5-day windows + atomic release RPC.
-- Parity with lib/container-earnings-schedule.ts, lib/server/fixed-trade-lifecycle-v2.ts, app/api/user/fixed-trade/release-earnings/route.ts

-- ---------------------------------------------------------------------------
-- int32 helpers (JavaScript Math.imul / mulberry32 / stringSeed parity)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION internal_imul32(a_in bigint, b_in bigint)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $f$
DECLARE
  a bigint;
  b bigint;
  ah bigint;
  al bigint;
  bh bigint;
  bl bigint;
  res bigint;
BEGIN
  a := a_in & 4294967295;
  b := b_in & 4294967295;
  ah := (a >> 16) & 65535;
  al := a & 65535;
  bh := (b >> 16) & 65535;
  bl := b & 65535;
  res := ((al * bh + ah * bl) << 16) + (al * bl);
  res := res & 4294967295;
  IF res >= 2147483648 THEN
    res := res - 4294967296;
  END IF;
  RETURN res;
END;
$f$;

CREATE OR REPLACE FUNCTION internal_string_seed(p text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $f$
DECLARE
  h bigint := 2166136261;
  i int;
  c int;
BEGIN
  FOR i IN 1..coalesce(char_length(p), 0) LOOP
    c := ascii(substr(p, i, 1));
    h := (h # c::bigint) & 4294967295;
    h := internal_imul32(h, 16777619) & 4294967295;
  END LOOP;
  RETURN h & 4294967295;
END;
$f$;

CREATE OR REPLACE FUNCTION internal_mulberry32_step(p_seed bigint)
RETURNS TABLE(new_seed bigint, rnd double precision)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $f$
DECLARE
  t bigint;
  m bigint;
  s bigint := p_seed & 4294967295;
BEGIN
  s := (s + 1831565813) & 4294967295;
  t := s;
  t := internal_imul32((t # ((t >> 15) & 4294967295)) & 4294967295, (t | 1) & 4294967295) & 4294967295;
  m := internal_imul32((t # ((t >> 7) & 4294967295)) & 4294967295, (t | 61) & 4294967295) & 4294967295;
  t := (t # ((t + m) & 4294967295)) & 4294967295;
  RETURN QUERY
  SELECT
    t AS new_seed,
    (((t # ((t >> 14) & 4294967295)) & 4294967295)::double precision / 4294967296.0) AS rnd;
END;
$f$;

CREATE OR REPLACE FUNCTION internal_round_usd2(n numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $f$
  SELECT round(coalesce(n, 0)::numeric, 2);
$f$;

-- ---------------------------------------------------------------------------
-- Legacy schedule (CONTAINER_PERIOD_RETURN_MONTHLY_PCT = 23) + smooth accrual
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION internal_fix_period_day_count(p_months int)
RETURNS int
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $f$
  SELECT CASE
    WHEN p_months = 1 THEN 30
    WHEN p_months = 3 THEN 90
    WHEN p_months = 6 THEN 180
    ELSE 30
  END;
$f$;

CREATE OR REPLACE FUNCTION internal_build_container_daily_schedule(
  p_principal numeric,
  p_months int,
  p_seed_key text,
  p_insurance numeric
)
RETURNS numeric[]
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $f$
DECLARE
  days int := internal_fix_period_day_count(p_months);
  ins numeric := greatest(0::numeric, internal_round_usd2(p_insurance));
  net_yield numeric := internal_round_usd2(p_principal - ins);
  base_usd numeric := CASE WHEN net_yield > 0 THEN net_yield ELSE internal_round_usd2(p_principal) END;
  target numeric := internal_round_usd2(base_usd * (23::numeric / 100) * p_months::numeric);
  rnd_seed bigint := internal_string_seed(coalesce(p_seed_key, ''));
  weights numeric[] := ARRAY[]::numeric[];
  sum_w numeric := 0;
  daily numeric[] := ARRAY[]::numeric[];
  i int;
  w numeric;
  r double precision;
  scale numeric;
  drift numeric;
BEGIN
  IF days <= 0 OR target < 0 THEN
    RETURN ARRAY[]::numeric[];
  END IF;
  IF target = 0 THEN
    daily := ARRAY(SELECT 0::numeric FROM generate_series(1, days));
    RETURN daily;
  END IF;

  FOR i IN 1..days LOOP
    SELECT ms.new_seed, ms.rnd INTO rnd_seed, r FROM internal_mulberry32_step(rnd_seed) AS ms;
    w := 0.88::numeric + (r::numeric) * 0.24::numeric;
    weights := weights || w;
    sum_w := sum_w + w;
  END LOOP;

  scale := target / nullif(sum_w, 0);
  daily := ARRAY[]::numeric[];
  FOR i IN 1..days LOOP
    daily := daily || round((weights[i] * scale)::numeric, 2);
  END LOOP;

  drift := round((target - (SELECT coalesce(sum(x), 0) FROM unnest(daily) AS x))::numeric, 2);
  IF days > 0 THEN
    daily[days] := round((daily[days] + drift)::numeric, 2);
  END IF;
  RETURN daily;
END;
$f$;

CREATE OR REPLACE FUNCTION internal_cumulative_through_day(p_sched numeric[], p_completed int)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $f$
DECLARE
  n int;
  i int;
  s numeric := 0;
BEGIN
  IF p_sched IS NULL THEN
    RETURN 0;
  END IF;
  n := greatest(0, least(coalesce(array_length(p_sched, 1), 0), p_completed));
  FOR i IN 1..n LOOP
    s := s + coalesce(p_sched[i], 0);
  END LOOP;
  RETURN round(s::numeric, 2);
END;
$f$;

CREATE OR REPLACE FUNCTION internal_total_schedule_target(p_sched numeric[])
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $f$
  SELECT CASE
    WHEN p_sched IS NULL OR array_length(p_sched, 1) IS NULL THEN 0::numeric
    ELSE round((SELECT coalesce(sum(x), 0) FROM unnest(p_sched) AS x)::numeric, 2)
  END;
$f$;

CREATE OR REPLACE FUNCTION internal_scheduled_earned_smooth(
  p_sched numeric[],
  p_start timestamptz,
  p_end timestamptz
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $f$
DECLARE
  cap numeric;
  elapsed_ms numeric;
  full_days int;
  partial numeric;
  base numeric;
  day_bucket numeric;
  len int;
BEGIN
  IF p_sched IS NULL OR coalesce(array_length(p_sched, 1), 0) = 0 THEN
    RETURN 0;
  END IF;
  cap := internal_total_schedule_target(p_sched);
  len := array_length(p_sched, 1);
  elapsed_ms := greatest(
    0::numeric,
    (extract(epoch from (p_end - p_start)) * 1000)::numeric
  );
  IF elapsed_ms <= 0 THEN
    RETURN 0;
  END IF;

  full_days := floor(elapsed_ms / 86400000)::int;
  partial := ((elapsed_ms % 86400000) / 86400000.0)::numeric;

  IF full_days >= len THEN
    RETURN cap;
  END IF;

  base := internal_cumulative_through_day(p_sched, full_days);
  day_bucket := coalesce(p_sched[full_days + 1], 0::numeric);
  RETURN round(
    least(cap, base + day_bucket * partial)::numeric,
    2
  );
END;
$f$;

-- ---------------------------------------------------------------------------
-- V2 lifecycle accrued gross (metadata.lifecycle.dailyUsd)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION internal_fixed_trade_v2_accrued_gross_usd(
  p_lifecycle jsonb,
  p_created timestamptz,
  p_now timestamptz
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $f$
DECLARE
  daily numeric[];
  v_target numeric;
  v_term int;
  elapsed_ms numeric;
  lease_ms numeric;
  capped_ms numeric;
  full_days int;
  frac numeric;
  s numeric := 0;
  i int;
  len int;
BEGIN
  IF p_lifecycle IS NULL OR jsonb_typeof(p_lifecycle -> 'dailyUsd') <> 'array' THEN
    RETURN 0;
  END IF;

  SELECT coalesce(array_agg(round((x #>> '{}')::numeric, 2) ORDER BY ord), ARRAY[]::numeric[])
  INTO daily
  FROM jsonb_array_elements(p_lifecycle -> 'dailyUsd') WITH ORDINALITY AS t(x, ord);

  len := coalesce(array_length(daily, 1), 0);
  IF len = 0 THEN
    RETURN 0;
  END IF;

  v_target := internal_round_usd2((p_lifecycle ->> 'targetProfitUsd')::numeric);
  v_term := coalesce(nullif((p_lifecycle ->> 'termDays')::int, 0), len);

  elapsed_ms := greatest(0::numeric, (extract(epoch from (p_now - p_created)) * 1000)::numeric);
  lease_ms := (v_term::numeric * 86400000);
  capped_ms := least(elapsed_ms, lease_ms);

  full_days := floor(capped_ms / 86400000)::int;
  frac := least(
    1::numeric,
    ((capped_ms - full_days::numeric * 86400000) / 86400000.0)::numeric
  );

  FOR i IN 1..least(full_days, len) LOOP
    s := s + coalesce(daily[i], 0);
  END LOOP;

  IF full_days < len AND frac > 0 THEN
    s := s + coalesce(daily[full_days + 1], 0::numeric) * frac;
  END IF;

  RETURN round(least(v_target, round(s::numeric, 2))::numeric, 2);
END;
$f$;

CREATE OR REPLACE FUNCTION internal_fixed_trade_policy_gross_usd(
  p_metadata jsonb,
  p_principal numeric,
  p_insurance numeric,
  p_months int,
  p_seed_key text,
  p_session_id uuid,
  p_created timestamptz,
  p_now timestamptz
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $f$
DECLARE
  lc jsonb;
  sched numeric[];
  sk text;
BEGIN
  lc := p_metadata -> 'lifecycle';
  IF lc IS NOT NULL
     AND (lc ->> 'v')::int = 2
     AND coalesce(lc ->> 'engine', '') = 'target_profit_v1'
     AND jsonb_typeof(lc -> 'dailyUsd') = 'array'
     AND jsonb_array_length(lc -> 'dailyUsd') > 0
  THEN
    RETURN internal_fixed_trade_v2_accrued_gross_usd(lc, p_created, p_now);
  END IF;

  sk := nullif(trim(coalesce(p_seed_key, '')), '');
  IF sk IS NULL OR sk = '' THEN
    sk := format('%s-%s-%s-%s', p_session_id::text, internal_round_usd2(p_principal), p_months::text, p_created::text);
  END IF;

  sched := internal_build_container_daily_schedule(
    internal_round_usd2(p_principal),
    p_months,
    sk,
    internal_round_usd2(p_insurance)
  );
  RETURN internal_scheduled_earned_smooth(sched, p_created, p_now);
END;
$f$;

CREATE OR REPLACE FUNCTION internal_fixed_withdraw_percent(p_months int)
RETURNS int
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $f$
  SELECT CASE
    WHEN p_months = 1 THEN 30
    WHEN p_months = 3 THEN 50
    WHEN p_months = 6 THEN 70
    ELSE 30
  END;
$f$;

CREATE OR REPLACE FUNCTION internal_format_duration_phrase(p_seconds bigint)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $f$
DECLARE
  s bigint := greatest(0, coalesce(p_seconds, 0));
  days bigint;
  hrs bigint;
  mins bigint;
  parts text[] := ARRAY[]::text[];
BEGIN
  days := s / 86400;
  hrs := (s % 86400) / 3600;
  mins := (s % 3600) / 60;
  IF days > 0 THEN
    parts := parts || format(
      '%s %s',
      days::text,
      CASE WHEN days = 1 THEN 'day' ELSE 'days' END
    );
  END IF;
  IF hrs > 0 THEN
    parts := parts || format(
      '%s %s',
      hrs::text,
      CASE WHEN hrs = 1 THEN 'hour' ELSE 'hours' END
    );
  END IF;
  IF days = 0 AND hrs = 0 AND mins > 0 THEN
    parts := parts || format(
      '%s %s',
      mins::text,
      CASE WHEN mins = 1 THEN 'minute' ELSE 'minutes' END
    );
  END IF;
  IF array_length(parts, 1) IS NULL OR array_length(parts, 1) = 0 THEN
    RETURN 'less than a minute';
  END IF;
  RETURN array_to_string(parts, ' ');
END;
$f$;

-- ---------------------------------------------------------------------------
-- Idempotency (concurrent duplicate POST same 5-day window)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fixed_trade_earnings_release_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.fixed_trade_sessions (id) ON DELETE CASCADE,
  release_window_index int NOT NULL,
  user_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT fixed_trade_release_idem_session_window UNIQUE (session_id, release_window_index)
);

ALTER TABLE public.fixed_trade_earnings_release_idempotency ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.fixed_trade_earnings_release_idempotency IS
  'One row per successful partial fixed-trade earnings release per 5-day window index; supports idempotent replay.';

REVOKE ALL ON TABLE public.fixed_trade_earnings_release_idempotency FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.fixed_trade_earnings_release_idempotency TO service_role;

-- ---------------------------------------------------------------------------
-- Preview: withdrawable state + window messaging (read-only)
-- ---------------------------------------------------------------------------

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
  v_pct int;
  v_slice_cap numeric;
  v_to_release numeric;
  v_d int;
  v_current_period int;
  v_last_period int;
  v_ld int;
  v_calendar boolean;
  v_next_unlock_day int;
  v_unlock_at timestamptz;
  v_rem_s bigint;
  v_phrase text;
  v_msg text;
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
  v_pct := internal_fixed_withdraw_percent(fts.fix_period_months::int);
  v_slice_cap := round((v_headroom * (v_pct::numeric / 100))::numeric, 2);
  v_to_release := round(greatest(0::numeric, least(v_slice_cap, v_headroom))::numeric, 2);

  v_d := floor(extract(epoch FROM (v_now - fts.created_at)) / 86400.0)::int;
  v_current_period := v_d / 5;
  v_last_period := -1;
  IF fts.last_earnings_release_at IS NOT NULL THEN
    v_ld := floor(extract(epoch FROM (fts.last_earnings_release_at - fts.created_at)) / 86400.0)::int;
    v_last_period := v_ld / 5;
  END IF;

  v_calendar := v_current_period >= 1 AND v_current_period > v_last_period;

  v_next_unlock_day := CASE WHEN v_last_period < 0 THEN 5 ELSE (v_last_period + 1) * 5 END;
  v_unlock_at := fts.created_at + (v_next_unlock_day::text || ' days')::interval;
  v_rem_s := greatest(0::bigint, floor(extract(epoch FROM (v_unlock_at - v_now)))::bigint);
  v_phrase := internal_format_duration_phrase(v_rem_s);
  v_msg :=
    'Next release unlocks in '
    || v_phrase
    || '. Current accrued profit continues growing until the next release window.';

  RETURN jsonb_build_object(
    'ok', true,
    'window_open', v_calendar,
    'next_unlock_at', to_char(v_unlock_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'remaining_duration_seconds', v_rem_s,
    'remaining_duration_phrase', v_phrase,
    'user_message', v_msg,
    'current_accrued_gross_usd', v_gross,
    'cumulative_released_gross_usd', v_cum,
    'headroom_usd', v_headroom,
    'withdraw_percent', v_pct,
    'eligible_percent_next_window', v_pct,
    'withdrawable_gross_usd', CASE WHEN v_calendar THEN v_to_release ELSE 0::numeric END,
    'release_fee_rate', 0.01,
    'next_unlock_day_index', v_next_unlock_day,
    'session_day_index', v_d,
    'current_window_index', v_current_period,
    'last_release_window_index', v_last_period
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.fixed_trade_calculate_withdrawable_v1(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fixed_trade_calculate_withdrawable_v1(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fixed_trade_calculate_withdrawable_v1(uuid, uuid) IS
  'Server-only fixed-trade withdrawable preview: rolling 5-day windows, (accruedGross - cumulativeReleased) * withdrawPercent.';

-- ---------------------------------------------------------------------------
-- Atomic release (balance + session + audit + idempotency)
-- ---------------------------------------------------------------------------

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
  v_pct int;
  v_slice_cap numeric;
  v_to_release numeric;
  v_fee numeric;
  v_liq numeric;
  v_next_cum numeric;
  v_d int;
  v_current_period int;
  v_last_period int;
  v_ld int;
  v_calendar boolean;
  v_prev_liquid numeric;
  v_next_liquid numeric;
  v_tx text := gen_random_uuid()::text;
  v_avail numeric;
  v_stake numeric;
  v_rowcount int;
  cached jsonb;
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

  v_d := floor(extract(epoch FROM (v_now - fts.created_at)) / 86400.0)::int;
  v_current_period := v_d / 5;
  v_last_period := -1;
  IF fts.last_earnings_release_at IS NOT NULL THEN
    v_ld := floor(extract(epoch FROM (fts.last_earnings_release_at - fts.created_at)) / 86400.0)::int;
    v_last_period := v_ld / 5;
  END IF;

  SELECT r.result
  INTO cached
  FROM public.fixed_trade_earnings_release_idempotency r
  WHERE r.session_id = p_session_id
    AND r.release_window_index = v_current_period
    AND r.user_id = p_user_id;

  IF FOUND THEN
    SELECT round(ub.available_balance::numeric, 2),
      round(ub.container_withdrawable_earnings::numeric, 2)
    INTO v_avail, v_next_liquid
    FROM public.user_balances ub
    WHERE ub.user_id = p_user_id;
    RETURN cached
      || jsonb_build_object(
        'idempotent', true,
        'replay', true,
        'available_balance', coalesce(v_avail, 0),
        'container_withdrawable_earnings', coalesce(v_next_liquid, 0)
      );
  END IF;

  v_calendar := v_current_period >= 1 AND v_current_period > v_last_period;

  IF NOT v_calendar THEN
    RETURN public.fixed_trade_calculate_withdrawable_v1(p_session_id, p_user_id)
      || jsonb_build_object('ok', false, 'error', 'WITHDRAW_WINDOW_LOCKED');
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
    RETURN jsonb_build_object('ok', false, 'error', 'headroom_exhausted', 'policy_gross_usd', v_gross, 'cumulative_released_usd', v_cum);
  END IF;

  v_pct := internal_fixed_withdraw_percent(fts.fix_period_months::int);
  v_slice_cap := round((v_headroom * (v_pct::numeric / 100))::numeric, 2);
  v_to_release := round(greatest(0::numeric, least(v_slice_cap, v_headroom))::numeric, 2);

  IF NOT (v_to_release > 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_eligible_slice');
  END IF;

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
      'release_window_index', v_current_period,
      'pair_ref', v_tx
    )
  );

  SELECT round(ub.available_balance::numeric, 2),
    round(ub.container_withdrawable_earnings::numeric, 2)
  INTO v_avail, v_next_liquid
  FROM public.user_balances ub
  WHERE ub.user_id = p_user_id;

  INSERT INTO public.fixed_trade_earnings_release_idempotency (
    session_id,
    release_window_index,
    user_id,
    result
  )
  VALUES (
    p_session_id,
    v_current_period,
    p_user_id,
    jsonb_build_object(
      'ok', true,
      'idempotent', false,
      'released_gross_usd', v_to_release,
      'fee_usd', v_fee,
      'credited_liquid_usd', v_liq,
      'cumulative_released_usd', v_next_cum,
      'policy_gross_usd', v_gross,
      'available_balance', v_avail,
      'container_withdrawable_earnings', v_next_liquid,
      'transaction_ref', v_tx,
      'release_window_index', v_current_period
    )
  );

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
    'transaction_ref', v_tx,
    'release_window_index', v_current_period
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.fixed_trade_release_earnings_window_v1(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fixed_trade_release_earnings_window_v1(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fixed_trade_release_earnings_window_v1(uuid, uuid) IS
  'Atomically releases one fixed-trade earnings slice into container_withdrawable_earnings; 5-day rolling window + idempotent replay per window index.';

-- Lock down helpers (not callable except by owner/superuser in typical setups)
REVOKE ALL ON FUNCTION internal_imul32(bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_string_seed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_mulberry32_step(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_round_usd2(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_fix_period_day_count(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_build_container_daily_schedule(numeric, int, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_cumulative_through_day(numeric[], int) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_total_schedule_target(numeric[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_scheduled_earned_smooth(numeric[], timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_fixed_trade_v2_accrued_gross_usd(jsonb, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_fixed_trade_policy_gross_usd(jsonb, numeric, numeric, int, text, uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_fixed_withdraw_percent(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_format_duration_phrase(bigint) FROM PUBLIC;
