-- Closed-loop withdrawals: investigate state + resolution + payout lifecycle

ALTER TABLE public.withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;

ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_check
  CHECK (status IN ('pending', 'under_review', 'approved', 'rejected'));

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS resolution_note TEXT NULL;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ NULL;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'withdrawal_requests_payout_status_check'
  ) THEN
    ALTER TABLE public.withdrawal_requests
      ADD CONSTRAINT withdrawal_requests_payout_status_check
      CHECK (payout_status IN ('none', 'pending_internal_release', 'recycled_pending_external'));
  END IF;
END $$;

COMMENT ON COLUMN public.withdrawal_requests.payout_status IS
  'after approve: recycled_pending_external = user frozen funds cleared & master pool credited internally; ops pays out off-platform.';
COMMENT ON COLUMN public.withdrawal_requests.resolution_note IS
  'L5 liquidity admin note (reject / hold / approve context).';
