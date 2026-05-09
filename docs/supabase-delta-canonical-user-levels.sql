-- -----------------------------------------------------------------------------
-- Canonical platform roles (Profiles ↔ Auth). Safe to re-run.
-- Prerequisites: docs/supabase-delta-security-levels-retailer.sql (trading_user_level),
-- docs/supabase-delta-retailer-credit-seller.sql (retailer_credit_seller column).
--
-- Resolved identities (matched on auth.users email LOCAL PART only, lowercase):
--   deanwhisley2  → Level 5 (liquidity / admin desks in-app when bootstrap reads profile)
--   esknexuspro   → Level 2 + retailer_credit_seller (designated retailer credit desk)
-- -----------------------------------------------------------------------------

-- Level 5: master liquidity / admin-facing tier (no retailer desk flag unless you choose otherwise).
UPDATE public.profiles AS p
SET
  trading_user_level = 5,
  retailer_credit_seller = COALESCE(p.retailer_credit_seller, FALSE),
  updated_at = NOW()
FROM auth.users AS u
WHERE u.id = p.id
  AND COALESCE(trim(u.email::text), '') <> ''
  AND lower(split_part(trim(u.email::text), '@', 1)) = 'deanwhisley2';

-- Level 2 retailer: ops + retailer credit designation for designated desks.
UPDATE public.profiles AS p
SET
  trading_user_level = 2,
  retailer_credit_seller = TRUE,
  updated_at = NOW()
FROM auth.users AS u
WHERE u.id = p.id
  AND COALESCE(trim(u.email::text), '') <> ''
  AND lower(split_part(trim(u.email::text), '@', 1)) = 'esknexuspro';

-- Verify (run in SQL editor):
-- SELECT u.email, p.trading_user_level, p.retailer_credit_seller
-- FROM auth.users u INNER JOIN public.profiles p ON p.id = u.id
-- WHERE split_part(lower(trim(u.email::text)), '@', 1) IN ('deanwhisley2', 'esknexuspro');
