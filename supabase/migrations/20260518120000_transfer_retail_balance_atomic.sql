-- Atomically debit retailer retail_balance and credit customer Nexus Main (available_balance).
-- Prevents partial applies when client upserts fail silently or apply out of order.
CREATE OR REPLACE FUNCTION public.transfer_retail_balance_to_customer(
  p_retailer_user_id uuid,
  p_customer_user_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rb numeric;
  v_rm numeric;
  v_ca numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT COALESCE(ub.retail_balance, 0), COALESCE(ub.available_balance, 0)
  INTO v_rb, v_rm
  FROM public.user_balances ub
  WHERE ub.user_id = p_retailer_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETAILER_USER_BALANCES_MISSING';
  END IF;

  IF v_rb < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_RETAIL_BALANCE';
  END IF;

  UPDATE public.user_balances
  SET retail_balance = v_rb - p_amount,
      last_updated = now()
  WHERE user_id = p_retailer_user_id;

  INSERT INTO public.user_balances (user_id, available_balance, last_updated)
  VALUES (p_customer_user_id, p_amount, now())
  ON CONFLICT (user_id) DO UPDATE
  SET available_balance = public.user_balances.available_balance + EXCLUDED.available_balance,
      last_updated = now()
  RETURNING available_balance INTO v_ca;

  RETURN jsonb_build_object(
    'retailer_retail_balance_after', v_rb - p_amount,
    'customer_available_balance_after', v_ca
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_retail_balance_to_customer(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_retail_balance_to_customer(uuid, uuid, numeric) TO service_role;

COMMENT ON FUNCTION public.transfer_retail_balance_to_customer IS
  'Funding desk: single-transaction move from retailer retail_balance to customer available_balance (Nexus Main).';
