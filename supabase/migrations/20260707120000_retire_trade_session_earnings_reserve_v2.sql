-- Retire monthly reserve ledger; session payouts are matrix + join-time yield only.

DROP TABLE IF EXISTS public.user_trade_session_slot_ledger;
DROP TABLE IF EXISTS public.user_trade_session_earnings_reserves;
