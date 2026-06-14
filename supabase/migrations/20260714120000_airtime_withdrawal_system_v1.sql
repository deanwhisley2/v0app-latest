-- Airtime Withdrawal System v1
-- =============================
--
-- Enables users to withdraw earnings as mobile airtime (KES/UGX).
-- Also splits withdrawal into two paths:
--   "earnings" → airtime or withdraw (from container_withdrawable_earnings)
--   "nexus"   → capital withdraw (from available_balance)
--
-- New tables:
--   airtime_requests  — user airtime purchase requests
--
-- Modifies existing flows:
--   - withdrawal_requests stays for Nexus Main capital withdrawals
--   - container-earnings API gains "withdraw" (to cash) and "airtime" options

-- 1. Airtime requests table
CREATE TABLE IF NOT EXISTS public.airtime_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Which balance source: 'earnings' only
  source        text NOT NULL DEFAULT 'earnings' CHECK (source IN ('earnings')),
  -- Amount in USD (converted from local currency)
  amount_usd    numeric(14,2) NOT NULL CHECK (amount_usd > 0),
  -- Local currency amount & currency
  amount_local  numeric(14,2) NOT NULL CHECK (amount_local > 0),
  local_currency text NOT NULL CHECK (local_currency IN ('KES','UGX')),
  -- Network (MTN, Airtel, Safaricom, etc.)
  network       text NOT NULL,
  -- Phone number to receive airtime
  phone_number  text NOT NULL,
  -- Account/line names
  account_names text,
  -- Payment tracking
  transaction_ref     text,
  -- Status: pending, approved, declined, failed, completed
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','failed','completed')),
  -- Admin who approved/declined
  reviewed_by   uuid REFERENCES auth.users(id),
  reviewed_at   timestamptz,
  -- Completion details
  completed_at  timestamptz,
  -- Nexo Security PIN hash for verification
  security_code_hash text,
  -- Extra metadata
  metadata      jsonb DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_airtime_requests_user_id ON public.airtime_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_airtime_requests_status ON public.airtime_requests(status);
CREATE INDEX IF NOT EXISTS idx_airtime_requests_created_at ON public.airtime_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.airtime_requests ENABLE ROW LEVEL SECURITY;

-- Users can view own airtime requests
CREATE POLICY airtime_requests_user_select ON public.airtime_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert own airtime requests
CREATE POLICY airtime_requests_user_insert ON public.airtime_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins (level 5) can see all
CREATE POLICY airtime_requests_admin_select ON public.airtime_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Admins can update (approve/decline)
CREATE POLICY airtime_requests_admin_update ON public.airtime_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- 2. Add 'airtime_withdrawable_earnings' column to user_balances if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_balances'
      AND column_name = 'airtime_withdrawable_earnings'
  ) THEN
    ALTER TABLE public.user_balances
      ADD COLUMN airtime_withdrawable_earnings numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 3. Rename 'container_withdrawable_earnings' concept for clarity
--    We keep the column name but add a view for the new naming

-- Helper function: round USD to 2 decimals
CREATE OR REPLACE FUNCTION public.internal_round_usd2(val numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$ SELECT round(val * 100) / 100 $$;

-- 4. Function to process airtime request (debit earnings, create pending)
CREATE OR REPLACE FUNCTION public.request_airtime_v1(
  p_user_id uuid,
  p_amount_usd numeric,
  p_amount_local numeric,
  p_local_currency text,
  p_network text,
  p_phone_number text,
  p_account_names text DEFAULT NULL,
  p_security_code_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_bal record;
  v_new_earnings numeric;
  v_ref text := gen_random_uuid()::text;
  v_request_id uuid;
BEGIN
  -- Lock user balance row
  SELECT *
  INTO v_bal
  FROM public.user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_not_found');
  END IF;

  -- Check earnings balance (container_withdrawable_earnings + airtime_withdrawable_earnings are same pool)
  -- We debit from container_withdrawable_earnings
  IF coalesce(v_bal.container_withdrawable_earnings, 0) < p_amount_usd THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_earnings',
      'available_usd', v_bal.container_withdrawable_earnings,
      'required_usd', p_amount_usd
    );
  END IF;

  -- Deduct from earnings
  v_new_earnings := public.internal_round_usd2(v_bal.container_withdrawable_earnings - p_amount_usd);

  UPDATE public.user_balances
  SET
    container_withdrawable_earnings = v_new_earnings,
    airtime_withdrawable_earnings = public.internal_round_usd2(coalesce(airtime_withdrawable_earnings, 0) + p_amount_usd),
    last_updated = timezone('utc', now())
  WHERE user_id = p_user_id;

  -- Create airtime request
  INSERT INTO public.airtime_requests (
    user_id,
    source,
    amount_usd,
    amount_local,
    local_currency,
    network,
    phone_number,
    account_names,
    transaction_ref,
    status,
    security_code_hash,
    metadata
  ) VALUES (
    p_user_id,
    'earnings',
    p_amount_usd,
    p_amount_local,
    p_local_currency,
    p_network,
    p_phone_number,
    p_account_names,
    v_ref,
    'pending',
    p_security_code_hash,
    jsonb_build_object('initiated_at', timezone('utc', now())::text)
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'transaction_ref', v_ref,
    'amount_usd', p_amount_usd,
    'amount_local', p_amount_local,
    'local_currency', p_local_currency,
    'status', 'pending'
  );
END;
$fn$;

-- 5. Function for admin to approve airtime request
CREATE OR REPLACE FUNCTION public.approve_airtime_v1(
  p_request_id uuid,
  p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_req record;
  v_bal record;
  v_new_airtime_earnings numeric;
BEGIN
  SELECT *
  INTO v_req
  FROM public.airtime_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_pending', 'status', v_req.status);
  END IF;

  -- Debit from airtime_withdrawable_earnings (already moved from container_withdrawable_earnings when requested)
  SELECT *
  INTO v_bal
  FROM public.user_balances
  WHERE user_id = v_req.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_not_found');
  END IF;

  v_new_airtime_earnings := public.internal_round_usd2(
    coalesce(v_bal.airtime_withdrawable_earnings, 0) - v_req.amount_usd
  );

  IF v_new_airtime_earnings < 0 THEN
    -- Should not happen, but guard
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_airtime_earnings');
  END IF;

  UPDATE public.user_balances
  SET
    airtime_withdrawable_earnings = v_new_airtime_earnings,
    last_updated = timezone('utc', now())
  WHERE user_id = v_req.user_id;

  -- Mark request as approved
  UPDATE public.airtime_requests
  SET
    status = 'approved',
    reviewed_by = p_admin_id,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    metadata = metadata || jsonb_build_object(
      'approved_at', timezone('utc', now())::text,
      'admin_id', p_admin_id::text
    )
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'status', 'approved',
    'user_id', v_req.user_id,
    'amount_usd', v_req.amount_usd,
    'amount_local', v_req.amount_local,
    'local_currency', v_req.local_currency,
    'phone_number', v_req.phone_number,
    'network', v_req.network
  );
END;
$fn$;

-- 6. Function for admin to decline airtime request (refund earnings)
CREATE OR REPLACE FUNCTION public.decline_airtime_v1(
  p_request_id uuid,
  p_admin_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_req record;
  v_bal record;
  v_new_earnings numeric;
BEGIN
  SELECT *
  INTO v_req
  FROM public.airtime_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_pending', 'status', v_req.status);
  END IF;

  -- Refund: move back from airtime_withdrawable_earnings to container_withdrawable_earnings
  SELECT *
  INTO v_bal
  FROM public.user_balances
  WHERE user_id = v_req.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_not_found');
  END IF;

  v_new_earnings := public.internal_round_usd2(
    coalesce(v_bal.airtime_withdrawable_earnings, 0) - v_req.amount_usd
  );

  UPDATE public.user_balances
  SET
    container_withdrawable_earnings = public.internal_round_usd2(
      coalesce(container_withdrawable_earnings, 0) + v_req.amount_usd
    ),
    airtime_withdrawable_earnings = v_new_earnings,
    last_updated = timezone('utc', now())
  WHERE user_id = v_req.user_id;

  -- Mark as declined
  UPDATE public.airtime_requests
  SET
    status = 'declined',
    reviewed_by = p_admin_id,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    metadata = metadata || jsonb_build_object(
      'declined_at', timezone('utc', now())::text,
      'admin_id', p_admin_id::text,
      'decline_reason', p_reason
    )
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'status', 'declined',
    'refunded_usd', v_req.amount_usd
  );
END;
$fn$;

-- 7. Function to mark airtime as completed (after admin delivers)
CREATE OR REPLACE FUNCTION public.complete_airtime_v1(
  p_request_id uuid,
  p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_req record;
BEGIN
  SELECT *
  INTO v_req
  FROM public.airtime_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.status != 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_approved', 'status', v_req.status);
  END IF;

  UPDATE public.airtime_requests
  SET
    status = 'completed',
    completed_at = timezone('utc', now()),
    reviewed_by = p_admin_id,
    updated_at = timezone('utc', now()),
    metadata = metadata || jsonb_build_object(
      'completed_at', timezone('utc', now())::text,
      'completed_by', p_admin_id::text
    )
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'status', 'completed'
  );
END;
$fn$;
