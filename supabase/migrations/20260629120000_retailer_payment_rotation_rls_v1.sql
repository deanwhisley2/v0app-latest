-- Payment rotation: lock down public API exposure (server RPC / service_role only).
-- Production was deployed from split migrations without the RLS footer in retailer_payment_rotation_v1.

ALTER TABLE public.retailer_payment_rotation_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_payment_rotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_payment_rotation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_payment_line_client_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retailer_payment_rotation_pools_select_authenticated"
  ON public.retailer_payment_rotation_pools;
DROP POLICY IF EXISTS "retailer_payment_rotation_lines_select_authenticated"
  ON public.retailer_payment_rotation_lines;

REVOKE ALL ON TABLE public.retailer_payment_rotation_pools FROM anon, authenticated;
REVOKE ALL ON TABLE public.retailer_payment_rotation_lines FROM anon, authenticated;
REVOKE ALL ON TABLE public.retailer_payment_rotation_audit FROM anon, authenticated;
REVOKE ALL ON TABLE public.retailer_payment_line_client_usage FROM anon, authenticated;

COMMENT ON TABLE public.retailer_payment_rotation_audit IS
  'Rotation audit trail; service_role / SECURITY DEFINER RPCs only (no Data API client access).';

COMMENT ON TABLE public.retailer_payment_line_client_usage IS
  'Distinct approved clients per rotation line; service_role / SECURITY DEFINER RPCs only.';
