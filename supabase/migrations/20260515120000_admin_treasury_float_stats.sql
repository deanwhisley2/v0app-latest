-- Aggregate metrics for Level-5 treasury dashboard (service-role API only).
CREATE OR REPLACE FUNCTION public.admin_treasury_float_stats()
RETURNS TABLE (
  approved_float_topups_total_usd NUMERIC,
  pending_float_topup_count BIGINT,
  pending_float_topup_amount_requested_usd NUMERIC,
  retailer_desk_retail_balance_total_usd NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      SELECT COALESCE(SUM(r.amount_credited::numeric), 0)
      FROM public.retailer_admin_topup_requests r
      WHERE r.status = 'approved'
    ),
    (
      SELECT COUNT(*)::bigint
      FROM public.retailer_admin_topup_requests r2
      WHERE r2.status IN ('pending', 'under_review')
    ),
    (
      SELECT COALESCE(SUM(r3.amount_requested::numeric), 0)
      FROM public.retailer_admin_topup_requests r3
      WHERE r3.status IN ('pending', 'under_review')
    ),
    (
      SELECT COALESCE(SUM(ub.retail_balance::numeric), 0)
      FROM public.retailer_profiles rp
      INNER JOIN public.user_balances ub ON ub.user_id = rp.user_id
    );
$$;

REVOKE ALL ON FUNCTION public.admin_treasury_float_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_treasury_float_stats() TO service_role;

COMMENT ON FUNCTION public.admin_treasury_float_stats IS
  'USD-normalized aggregates for ops treasury UI: approved float credits, pending retailer top-ups, total retail_balance held on retailer_profiles desks.';
