-- Double-rejection payout cooldown (5h); single rejection does not block retries.
-- Application-enforced via withdrawal-rejection-cooldown service.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS withdrawal_cooldown_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS consecutive_rejections_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.withdrawal_cooldown_until IS
  'Payout hold until timestamp after 2 consecutive admin withdrawal rejections (5h). Withdrawals only; trading/deposits unaffected.';

COMMENT ON COLUMN public.profiles.consecutive_rejections_count IS
  'Rolling count of consecutive admin withdrawal rejections without an approval in between; resets on approval or admin cooldown clear.';
