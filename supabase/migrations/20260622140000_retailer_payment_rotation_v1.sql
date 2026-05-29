-- Smart payment-line rotation: one exposed number per (retailer desk, country, network).
-- Threshold: 5 approved settlements OR 5 distinct approved clients per line, then rest + round-robin.

CREATE TABLE IF NOT EXISTS public.retailer_payment_rotation_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_profile_id uuid NOT NULL REFERENCES public.retailer_profiles (id) ON DELETE CASCADE,
  country_code text NOT NULL,
  network_token text NOT NULL,
  corridor_desk_id uuid NULL REFERENCES public.retailer_corridor_desks (id) ON DELETE SET NULL,
  exposed_line_id uuid NULL,
  cycle_generation integer NOT NULL DEFAULT 0,
  lines_rested_this_cycle integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retailer_payment_rotation_pools_country_check CHECK (char_length(trim(country_code)) = 2),
  CONSTRAINT retailer_payment_rotation_pools_network_check CHECK (char_length(trim(network_token)) > 0)
);

COMMENT ON TABLE public.retailer_payment_rotation_pools IS
  'Load-balancing pool for retailer receive lines: one visible line per country + network per desk.';

CREATE UNIQUE INDEX IF NOT EXISTS retailer_payment_rotation_pools_route_uidx
  ON public.retailer_payment_rotation_pools (retailer_profile_id, country_code, network_token);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'retailer_payment_rotation_pools_route_uniq'
  ) THEN
    ALTER TABLE public.retailer_payment_rotation_pools
      ADD CONSTRAINT retailer_payment_rotation_pools_route_uniq
      UNIQUE (retailer_profile_id, country_code, network_token);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.retailer_payment_rotation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.retailer_payment_rotation_pools (id) ON DELETE CASCADE,
  line_key text NOT NULL,
  display_order smallint NOT NULL DEFAULT 0,
  payment_line jsonb NOT NULL,
  line_state text NOT NULL DEFAULT 'eligible',
  approved_count integer NOT NULL DEFAULT 0,
  unique_client_count integer NOT NULL DEFAULT 0,
  pending_session_count integer NOT NULL DEFAULT 0,
  rotation_deferred boolean NOT NULL DEFAULT false,
  disabled_at timestamptz NULL,
  last_exposed_at timestamptz NULL,
  last_rested_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retailer_payment_rotation_lines_state_check CHECK (
    line_state IN ('eligible', 'exposed', 'resting', 'disabled')
  ),
  CONSTRAINT retailer_payment_rotation_lines_counts_nonneg CHECK (
    approved_count >= 0 AND unique_client_count >= 0 AND pending_session_count >= 0
  )
);

COMMENT ON TABLE public.retailer_payment_rotation_lines IS
  'Individual receive line within a rotation pool; exactly one exposed per pool under normal operation.';

CREATE UNIQUE INDEX IF NOT EXISTS retailer_payment_rotation_lines_pool_key_uidx
  ON public.retailer_payment_rotation_lines (pool_id, line_key);

CREATE INDEX IF NOT EXISTS retailer_payment_rotation_lines_pool_state_idx
  ON public.retailer_payment_rotation_lines (pool_id, line_state, display_order);

CREATE TABLE IF NOT EXISTS public.retailer_payment_line_client_usage (
  line_id uuid NOT NULL REFERENCES public.retailer_payment_rotation_lines (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  first_approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (line_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.retailer_payment_rotation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.retailer_payment_rotation_pools (id) ON DELETE CASCADE,
  line_id uuid NULL REFERENCES public.retailer_payment_rotation_lines (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retailer_payment_rotation_audit_event_check CHECK (
    event_type IN (
      'pool_synced',
      'line_activated',
      'line_rested',
      'line_rotated',
      'line_disabled',
      'line_recovered',
      'pending_bound',
      'pending_released',
      'approval_recorded',
      'rotation_deferred',
      'rotation_executed',
      'cycle_completed'
    )
  )
);

CREATE INDEX IF NOT EXISTS retailer_payment_rotation_audit_pool_idx
  ON public.retailer_payment_rotation_audit (pool_id, created_at DESC);

ALTER TABLE public.retailer_fund_requests
  ADD COLUMN IF NOT EXISTS payment_rotation_line_id uuid NULL
    REFERENCES public.retailer_payment_rotation_lines (id) ON DELETE SET NULL;

ALTER TABLE public.retailer_fund_requests
  ADD COLUMN IF NOT EXISTS payment_rotation_pool_id uuid NULL
    REFERENCES public.retailer_payment_rotation_pools (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.retailer_fund_requests.payment_rotation_line_id IS
  'Assigned receive line for local_mobile funding (rotation pool); sticky for pending requests.';

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retailer_payment_line_key(p_line jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    coalesce(nullif(trim(p_line->>'payment_type'), ''), 'generic')
    || '|'
    || regexp_replace(coalesce(p_line->>'value', ''), '[^0-9+]', '', 'g')
  );
$$;

CREATE OR REPLACE FUNCTION public.retailer_rotation_threshold()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 5;
$$;

CREATE OR REPLACE FUNCTION public._rotation_audit(
  p_pool_id uuid,
  p_line_id uuid,
  p_event_type text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.retailer_payment_rotation_audit (pool_id, line_id, event_type, details)
  VALUES (p_pool_id, p_line_id, p_event_type, coalesce(p_details, '{}'::jsonb));
END;
$$;

-- Pick next line to expose (eligible first; full cycle recovery when all rested).
CREATE OR REPLACE FUNCTION public._rotation_activate_next_line(p_pool_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool public.retailer_payment_rotation_pools%ROWTYPE;
  v_line_id uuid;
  v_total integer;
  v_resting integer;
BEGIN
  SELECT * INTO v_pool FROM public.retailer_payment_rotation_pools WHERE id = p_pool_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*)::integer, count(*) FILTER (WHERE line_state = 'resting')::integer
  INTO v_total, v_resting
  FROM public.retailer_payment_rotation_lines
  WHERE pool_id = p_pool_id AND line_state <> 'disabled';

  IF v_total IS NULL OR v_total = 0 THEN
    RETURN NULL;
  END IF;

  IF v_resting >= v_total AND v_total > 0 THEN
    UPDATE public.retailer_payment_rotation_lines
    SET
      line_state = 'eligible',
      approved_count = 0,
      unique_client_count = 0,
      rotation_deferred = false,
      updated_at = now()
    WHERE pool_id = p_pool_id AND line_state = 'resting';

    DELETE FROM public.retailer_payment_line_client_usage u
    USING public.retailer_payment_rotation_lines l
    WHERE u.line_id = l.id AND l.pool_id = p_pool_id;

    UPDATE public.retailer_payment_rotation_pools
    SET
      cycle_generation = cycle_generation + 1,
      lines_rested_this_cycle = 0,
      updated_at = now()
    WHERE id = p_pool_id;

    PERFORM public._rotation_audit(
      p_pool_id,
      NULL,
      'cycle_completed',
      jsonb_build_object('total_lines', v_total, 'cycle_generation', v_pool.cycle_generation + 1)
    );
  END IF;

  SELECT l.id INTO v_line_id
  FROM public.retailer_payment_rotation_lines l
  WHERE l.pool_id = p_pool_id
    AND l.line_state = 'eligible'
    AND l.pending_session_count = 0
    AND l.disabled_at IS NULL
  ORDER BY l.display_order ASC, l.created_at ASC
  LIMIT 1;

  IF v_line_id IS NULL THEN
    SELECT l.id INTO v_line_id
    FROM public.retailer_payment_rotation_lines l
    WHERE l.pool_id = p_pool_id
      AND l.line_state = 'resting'
      AND l.pending_session_count = 0
      AND l.disabled_at IS NULL
    ORDER BY l.last_rested_at ASC NULLS FIRST, l.display_order ASC
    LIMIT 1;

    IF v_line_id IS NOT NULL THEN
      UPDATE public.retailer_payment_rotation_lines
      SET
        line_state = 'eligible',
        approved_count = 0,
        unique_client_count = 0,
        rotation_deferred = false,
        updated_at = now()
      WHERE id = v_line_id;

      DELETE FROM public.retailer_payment_line_client_usage WHERE line_id = v_line_id;

      PERFORM public._rotation_audit(p_pool_id, v_line_id, 'line_recovered', '{}'::jsonb);
    END IF;
  END IF;

  IF v_line_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.retailer_payment_rotation_lines
  SET line_state = 'eligible', updated_at = now()
  WHERE pool_id = p_pool_id AND line_state = 'exposed' AND id IS DISTINCT FROM v_line_id;

  UPDATE public.retailer_payment_rotation_lines
  SET
    line_state = 'exposed',
    last_exposed_at = now(),
    updated_at = now()
  WHERE id = v_line_id;

  UPDATE public.retailer_payment_rotation_pools
  SET exposed_line_id = v_line_id, updated_at = now()
  WHERE id = p_pool_id;

  PERFORM public._rotation_audit(
    p_pool_id,
    v_line_id,
    'line_activated',
    jsonb_build_object('cycle_generation', v_pool.cycle_generation)
  );

  RETURN v_line_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._rotation_rest_exposed_line(p_pool_id uuid, p_force boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_th integer := public.retailer_rotation_threshold();
  v_line public.retailer_payment_rotation_lines%ROWTYPE;
  v_pool public.retailer_payment_rotation_pools%ROWTYPE;
BEGIN
  SELECT * INTO v_pool FROM public.retailer_payment_rotation_pools WHERE id = p_pool_id FOR UPDATE;
  IF NOT FOUND OR v_pool.exposed_line_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_line
  FROM public.retailer_payment_rotation_lines
  WHERE id = v_pool.exposed_line_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT p_force
    AND (
      v_line.approved_count < v_th
      AND v_line.unique_client_count < v_th
    )
  THEN
    RETURN false;
  END IF;

  IF v_line.pending_session_count > 0 AND NOT p_force THEN
    UPDATE public.retailer_payment_rotation_lines
    SET rotation_deferred = true, updated_at = now()
    WHERE id = v_line.id;
    PERFORM public._rotation_audit(
      p_pool_id,
      v_line.id,
      'rotation_deferred',
      jsonb_build_object('pending_session_count', v_line.pending_session_count)
    );
    RETURN false;
  END IF;

  UPDATE public.retailer_payment_rotation_lines
  SET
    line_state = 'resting',
    last_rested_at = now(),
    rotation_deferred = false,
    approved_count = 0,
    unique_client_count = 0,
    updated_at = now()
  WHERE id = v_line.id;

  DELETE FROM public.retailer_payment_line_client_usage WHERE line_id = v_line.id;

  UPDATE public.retailer_payment_rotation_pools
  SET
    exposed_line_id = NULL,
    lines_rested_this_cycle = lines_rested_this_cycle + 1,
    updated_at = now()
  WHERE id = p_pool_id;

  PERFORM public._rotation_audit(
    p_pool_id,
    v_line.id,
    'line_rested',
    jsonb_build_object(
      'approved_count_at_rest', v_line.approved_count,
      'unique_client_count_at_rest', v_line.unique_client_count
    )
  );

  PERFORM public._rotation_activate_next_line(p_pool_id);
  PERFORM public._rotation_audit(p_pool_id, v_line.id, 'line_rotated', '{}'::jsonb);
  RETURN true;
END;
$$;

-- Sync pool lines from canonical payment_numbers JSON (caller passes network-filtered array).
CREATE OR REPLACE FUNCTION public.sync_retailer_payment_rotation_pool(
  p_retailer_profile_id uuid,
  p_country_code text,
  p_network_token text,
  p_payment_numbers jsonb,
  p_corridor_desk_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_id uuid;
  v_cc text := upper(trim(p_country_code));
  v_net text := upper(trim(p_network_token));
  v_elem jsonb;
  v_key text;
  v_ord smallint := 0;
  v_keys text[] := '{}';
BEGIN
  IF v_cc IS NULL OR length(v_cc) <> 2 OR v_net IS NULL OR length(v_net) < 1 THEN
    RAISE EXCEPTION 'INVALID_ROTATION_ROUTE';
  END IF;

  IF p_payment_numbers IS NULL OR jsonb_typeof(p_payment_numbers) <> 'array' OR jsonb_array_length(p_payment_numbers) < 1 THEN
    RAISE EXCEPTION 'ROTATION_REQUIRES_PAYMENT_LINES';
  END IF;

  INSERT INTO public.retailer_payment_rotation_pools (
    retailer_profile_id,
    country_code,
    network_token,
    corridor_desk_id
  )
  VALUES (p_retailer_profile_id, v_cc, v_net, p_corridor_desk_id)
  ON CONFLICT (retailer_profile_id, country_code, network_token)
  DO UPDATE SET
    corridor_desk_id = coalesce(excluded.corridor_desk_id, retailer_payment_rotation_pools.corridor_desk_id),
    updated_at = now()
  RETURNING id INTO v_pool_id;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_payment_numbers)
  LOOP
    v_key := public.retailer_payment_line_key(v_elem);
    IF v_key IS NULL OR length(v_key) < 3 THEN
      CONTINUE;
    END IF;
    v_ord := v_ord + 1;
    v_keys := array_append(v_keys, v_key);

    INSERT INTO public.retailer_payment_rotation_lines (
      pool_id,
      line_key,
      display_order,
      payment_line
    )
    VALUES (v_pool_id, v_key, v_ord, v_elem)
    ON CONFLICT (pool_id, line_key)
    DO UPDATE SET
      payment_line = excluded.payment_line,
      display_order = excluded.display_order,
      disabled_at = NULL,
      line_state = CASE
        WHEN retailer_payment_rotation_lines.line_state = 'disabled' THEN 'eligible'
        ELSE retailer_payment_rotation_lines.line_state
      END,
      updated_at = now();
  END LOOP;

  UPDATE public.retailer_payment_rotation_lines
  SET
    line_state = 'disabled',
    disabled_at = now(),
    updated_at = now()
  WHERE pool_id = v_pool_id
    AND NOT (line_key = ANY (v_keys))
    AND line_state <> 'disabled';

  IF (
    SELECT count(*) FROM public.retailer_payment_rotation_lines
    WHERE pool_id = v_pool_id AND line_state <> 'disabled'
  ) = 1 THEN
    UPDATE public.retailer_payment_rotation_lines
    SET line_state = 'exposed', last_exposed_at = coalesce(last_exposed_at, now()), updated_at = now()
    WHERE pool_id = v_pool_id AND line_state <> 'disabled';

    UPDATE public.retailer_payment_rotation_pools p
    SET exposed_line_id = (
      SELECT l.id FROM public.retailer_payment_rotation_lines l
      WHERE l.pool_id = v_pool_id AND l.line_state = 'exposed' LIMIT 1
    ),
    updated_at = now()
    WHERE p.id = v_pool_id;
  ELSIF (
    SELECT exposed_line_id FROM public.retailer_payment_rotation_pools WHERE id = v_pool_id
  ) IS NULL THEN
    PERFORM public._rotation_activate_next_line(v_pool_id);
  END IF;

  PERFORM public._rotation_audit(v_pool_id, NULL, 'pool_synced', jsonb_build_object('line_count', v_ord));
  RETURN v_pool_id;
END;
$$;

-- Resolve line for customer UI (sticky pending + single exposed).
CREATE OR REPLACE FUNCTION public.resolve_retailer_payment_rotation_line(
  p_retailer_profile_id uuid,
  p_country_code text,
  p_network_token text,
  p_payment_numbers jsonb,
  p_user_id uuid DEFAULT NULL,
  p_corridor_desk_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_id uuid;
  v_line_id uuid;
  v_sticky uuid;
  v_line jsonb;
  v_cc text := upper(trim(p_country_code));
  v_net text := upper(trim(p_network_token));
BEGIN
  v_pool_id := public.sync_retailer_payment_rotation_pool(
    p_retailer_profile_id,
    v_cc,
    v_net,
    p_payment_numbers,
    p_corridor_desk_id
  );

  PERFORM 1 FROM public.retailer_payment_rotation_pools WHERE id = v_pool_id FOR UPDATE;

  IF p_user_id IS NOT NULL THEN
    SELECT r.payment_rotation_line_id INTO v_sticky
    FROM public.retailer_fund_requests r
    WHERE r.user_id = p_user_id
      AND r.retailer_id = p_retailer_profile_id
      AND r.payment_rotation_pool_id = v_pool_id
      AND r.status IN ('pending', 'under_review', 'appealed', 'escalated')
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF v_sticky IS NOT NULL THEN
      SELECT payment_line INTO v_line
      FROM public.retailer_payment_rotation_lines
      WHERE id = v_sticky AND pool_id = v_pool_id AND line_state <> 'disabled';

      IF FOUND THEN
        RETURN jsonb_build_object(
          'pool_id', v_pool_id,
          'line_id', v_sticky,
          'payment_line', v_line,
          'sticky_pending', true
        );
      END IF;
    END IF;
  END IF;

  SELECT exposed_line_id INTO v_line_id
  FROM public.retailer_payment_rotation_pools
  WHERE id = v_pool_id;

  IF v_line_id IS NULL THEN
    v_line_id := public._rotation_activate_next_line(v_pool_id);
  END IF;

  IF v_line_id IS NULL THEN
    RAISE EXCEPTION 'NO_ROTATION_LINE_AVAILABLE';
  END IF;

  SELECT payment_line INTO v_line
  FROM public.retailer_payment_rotation_lines
  WHERE id = v_line_id;

  RETURN jsonb_build_object(
    'pool_id', v_pool_id,
    'line_id', v_line_id,
    'payment_line', v_line,
    'sticky_pending', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_retailer_fund_request_rotation_line(
  p_fund_request_id uuid,
  p_line_id uuid,
  p_pool_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.retailer_fund_requests%ROWTYPE;
  v_line public.retailer_payment_rotation_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.retailer_fund_requests WHERE id = p_fund_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FUND_REQUEST_NOT_FOUND';
  END IF;

  SELECT * INTO v_line
  FROM public.retailer_payment_rotation_lines
  WHERE id = p_line_id AND pool_id = p_pool_id
  FOR UPDATE;

  IF NOT FOUND OR v_line.line_state = 'disabled' THEN
    RAISE EXCEPTION 'ROTATION_LINE_INVALID';
  END IF;

  IF v_line.line_state <> 'exposed' AND v_req.payment_rotation_line_id IS DISTINCT FROM p_line_id THEN
    RAISE EXCEPTION 'ROTATION_LINE_NOT_EXPOSED';
  END IF;

  UPDATE public.retailer_fund_requests
  SET
    payment_rotation_line_id = p_line_id,
    payment_rotation_pool_id = p_pool_id,
    updated_at = now()
  WHERE id = p_fund_request_id;

  UPDATE public.retailer_payment_rotation_lines
  SET pending_session_count = pending_session_count + 1, updated_at = now()
  WHERE id = p_line_id;

  PERFORM public._rotation_audit(
    p_pool_id,
    p_line_id,
    'pending_bound',
    jsonb_build_object('fund_request_id', p_fund_request_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_retailer_payment_rotation_pending(
  p_fund_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.retailer_fund_requests%ROWTYPE;
  v_line_id uuid;
  v_pool_id uuid;
  v_line public.retailer_payment_rotation_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.retailer_fund_requests WHERE id = p_fund_request_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_line_id := v_req.payment_rotation_line_id;
  v_pool_id := v_req.payment_rotation_pool_id;
  IF v_line_id IS NULL OR v_pool_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_line FROM public.retailer_payment_rotation_lines WHERE id = v_line_id FOR UPDATE;

  UPDATE public.retailer_payment_rotation_lines
  SET pending_session_count = greatest(0, pending_session_count - 1), updated_at = now()
  WHERE id = v_line_id
  RETURNING * INTO v_line;

  PERFORM public._rotation_audit(
    v_pool_id,
    v_line_id,
    'pending_released',
    jsonb_build_object('fund_request_id', p_fund_request_id, 'status', v_req.status)
  );

  IF v_line.rotation_deferred AND v_line.pending_session_count <= 0 THEN
    PERFORM public._rotation_rest_exposed_line(v_pool_id, true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_retailer_payment_rotation_approval(
  p_fund_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.retailer_fund_requests%ROWTYPE;
  v_line public.retailer_payment_rotation_lines%ROWTYPE;
  v_th integer := public.retailer_rotation_threshold();
  v_new_client boolean := false;
  v_rotated boolean := false;
BEGIN
  SELECT * INTO v_req FROM public.retailer_fund_requests WHERE id = p_fund_request_id;
  IF NOT FOUND OR v_req.payment_rotation_line_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  SELECT * INTO v_line
  FROM public.retailer_payment_rotation_lines
  WHERE id = v_req.payment_rotation_line_id
  FOR UPDATE;

  UPDATE public.retailer_payment_rotation_lines
  SET
    approved_count = approved_count + 1,
    pending_session_count = greatest(0, pending_session_count - 1),
    updated_at = now()
  WHERE id = v_line.id
  RETURNING * INTO v_line;

  WITH ins AS (
    INSERT INTO public.retailer_payment_line_client_usage (line_id, user_id)
    VALUES (v_line.id, v_req.user_id)
    ON CONFLICT (line_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_new_client FROM ins;

  IF v_new_client > 0 THEN
    UPDATE public.retailer_payment_rotation_lines
    SET unique_client_count = unique_client_count + 1, updated_at = now()
    WHERE id = v_line.id
    RETURNING * INTO v_line;
  END IF;

  PERFORM public._rotation_audit(
    v_req.payment_rotation_pool_id,
    v_line.id,
    'approval_recorded',
    jsonb_build_object(
      'fund_request_id', p_fund_request_id,
      'approved_count', v_line.approved_count,
      'unique_client_count', v_line.unique_client_count
    )
  );

  IF v_line.approved_count >= v_th OR v_line.unique_client_count >= v_th THEN
    v_rotated := public._rotation_rest_exposed_line(v_req.payment_rotation_pool_id, false);
    IF v_rotated THEN
      PERFORM public._rotation_audit(
        v_req.payment_rotation_pool_id,
        v_line.id,
        'rotation_executed',
        jsonb_build_object('trigger', 'threshold')
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'rotated', v_rotated,
    'approved_count', v_line.approved_count,
    'unique_client_count', v_line.unique_client_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.retailer_payment_line_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retailer_rotation_threshold() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rotation_audit(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rotation_activate_next_line(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rotation_rest_exposed_line(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_retailer_payment_rotation_pool(uuid, text, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_retailer_payment_rotation_line(uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bind_retailer_fund_request_rotation_line(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_retailer_payment_rotation_pending(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_retailer_payment_rotation_approval(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_retailer_payment_rotation_pool(uuid, text, text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_retailer_payment_rotation_line(uuid, text, text, jsonb, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_retailer_fund_request_rotation_line(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_retailer_payment_rotation_pending(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_retailer_payment_rotation_approval(uuid) TO service_role;

ALTER TABLE public.retailer_payment_rotation_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_payment_rotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_payment_rotation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_payment_line_client_usage ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: rotation is server-only via SECURITY DEFINER RPCs.
-- See 20260629120000_retailer_payment_rotation_rls_v1.sql for grant revocation on existing DBs.

REVOKE ALL ON TABLE public.retailer_payment_rotation_pools FROM anon, authenticated;
REVOKE ALL ON TABLE public.retailer_payment_rotation_lines FROM anon, authenticated;
REVOKE ALL ON TABLE public.retailer_payment_rotation_audit FROM anon, authenticated;
REVOKE ALL ON TABLE public.retailer_payment_line_client_usage FROM anon, authenticated;
