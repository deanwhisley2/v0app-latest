-- -----------------------------------------------------------------------------
-- Retail operations wallet — isolated Retail Balance + payer metadata + governance
-- Run after user_balances and retailer_fund_requests exist.
-- -----------------------------------------------------------------------------

-- Liquidity pool used only for approving user funding (not Nexus main / trading).
ALTER TABLE public.user_balances
  ADD COLUMN IF NOT EXISTS retail_balance NUMERIC(18, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_balances.retail_balance IS
  'Operational float for Level-2 retailers: user funding approvals debit this, not available_balance.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_balances_retail_balance_nonneg'
  ) THEN
    ALTER TABLE public.user_balances
      ADD CONSTRAINT user_balances_retail_balance_nonneg CHECK (retail_balance >= 0);
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

ALTER TABLE public.retailer_fund_requests
  ADD COLUMN IF NOT EXISTS payer_display_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS payer_phone TEXT NULL;

COMMENT ON COLUMN public.retailer_fund_requests.payer_display_name IS
  'Sender name entered by funding user before confirmation.';
COMMENT ON COLUMN public.retailer_fund_requests.payer_phone IS
  'Sending mobile number entered by funding user.';

-- Account governance (enforced in app layer; columns for admin Users panel).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS operational_freeze_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS account_disabled_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.profiles.operational_freeze_at IS
  'When set, account is operationally frozen (trading/transfers) until cleared by admin.';
COMMENT ON COLUMN public.profiles.account_disabled_at IS
  'When set, account access is disabled by admin (severe violations).';

-- Retailer response SLA window (shown to users / ops; escalate via appeals after deadline).
ALTER TABLE public.retailer_fund_requests
  ADD COLUMN IF NOT EXISTS retailer_response_deadline_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.retailer_fund_requests.retailer_response_deadline_at IS
  'Target resolution time from retailer desk (default from estimated_response_minutes on request creation).';
