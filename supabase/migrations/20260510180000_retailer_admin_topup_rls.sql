-- Secure retailer_admin_topup_requests: enable RLS (anon was Advisory-exposed via Data API).
-- API routes use createAdminClient() (service role bypasses RLS); authenticated policies match Level-2 retailer self-service.

ALTER TABLE public.retailer_admin_topup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retailer_topup_select_own" ON public.retailer_admin_topup_requests;
DROP POLICY IF EXISTS "retailer_topup_insert_own" ON public.retailer_admin_topup_requests;

CREATE POLICY "retailer_topup_select_own"
  ON public.retailer_admin_topup_requests
  FOR SELECT
  TO authenticated
  USING (retailer_user_id = auth.uid());

CREATE POLICY "retailer_topup_insert_own"
  ON public.retailer_admin_topup_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (retailer_user_id = auth.uid());

COMMENT ON TABLE public.retailer_admin_topup_requests IS
  'Retailer wires crypto to company wallet; Level-5 admin approves. Nexus credits retailer_requested * (1 + commission_rate). RLS: retailers see/insert own rows; admin updates via service_role.';
