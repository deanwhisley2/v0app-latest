-- Remap old user_account_notifications rows to new customer-friendly copy.
-- Uses metadata->>'event_type' to distinguish principal return from earnings credit.
-- Idempotent — safe to re-run.

-- 1) Principal return → "Session Closed" — never call this earnings/profit
UPDATE public.user_account_notifications
SET
  title = 'Session Closed',
  body = 'Your allocated trading capital has been returned to your Main Account.'
WHERE source_kind = 'container_balance_event'
  AND metadata->>'event_type' IN (
    'copy_trade_settlement_principal_to_main',
    'fixed_trade_maturity_principal_to_main',
    'fixed_trade_early_exit_principal_to_main'
  )
  AND title IS DISTINCT FROM 'Session Closed';

-- 2) Earnings credit → "Earnings Credited" — only actual profit
UPDATE public.user_account_notifications
SET
  title = 'Earnings Credited',
  body = 'Your trading earnings have been transferred to your Earnings Account.'
WHERE source_kind = 'container_balance_event'
  AND metadata->>'event_type' IN (
    'copy_trade_settlement_earnings_to_liquid',
    'fixed_trade_maturity_terminal_earnings_liquid',
    'fixed_trade_early_exit_earnings_liquid',
    'fixed_trade_earnings_to_container_liquid'
  )
  AND title IS DISTINCT FROM 'Earnings Credited';

-- 3) Nexus bot session complete → fallback to principal return
UPDATE public.user_account_notifications
SET
  title = 'Session Closed',
  body = 'Your allocated trading capital has been returned to your Main Account.'
WHERE source_kind = 'container_balance_event'
  AND metadata->>'event_type' IN (
    'nexus_trade_session_complete',
    'nexus_trade_session_reconcile_topup'
  )
  AND title IS DISTINCT FROM 'Session Closed';
