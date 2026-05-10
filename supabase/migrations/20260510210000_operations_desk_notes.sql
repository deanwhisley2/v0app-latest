-- Operations desk: staff notes / hold auditing for approvals

ALTER TABLE public.retailer_admin_topup_requests
  ADD COLUMN IF NOT EXISTS resolution_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ NULL;

ALTER TABLE public.retailer_fund_requests
  ADD COLUMN IF NOT EXISTS resolution_note TEXT NULL;

COMMENT ON COLUMN public.retailer_admin_topup_requests.resolution_note IS
  'Staff/admin resolution context (reject reason, investigate notes).';
COMMENT ON COLUMN public.retailer_fund_requests.resolution_note IS
  'Staff/admin resolution context shown in operations desk audit.';
