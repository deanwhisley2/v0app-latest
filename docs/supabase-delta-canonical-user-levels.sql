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

-- Level 2 retailer (esknexuspro): upsert profile + balance stub + retailer_profiles shell.
-- Handles both existing profile rows and accounts missing public.profiles (legacy / failed trigger).
INSERT INTO public.profiles (
  id, email, full_name, phone, avatar_url, is_verified,
  trading_user_level, retailer_credit_seller,
  created_at, updated_at
)
SELECT
  u.id,
  COALESCE(u.email::text, ''),
  COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''), ''),
  COALESCE(u.raw_user_meta_data->>'phone', ''),
  NULL,
  (u.email_confirmed_at IS NOT NULL),
  2,
  TRUE,
  NOW(),
  NOW()
FROM auth.users u
WHERE lower(split_part(trim(COALESCE(u.email::text, '')), '@', 1)) = 'esknexuspro'
ON CONFLICT (id) DO UPDATE SET
  trading_user_level = 2,
  retailer_credit_seller = TRUE,
  email = COALESCE(EXCLUDED.email, public.profiles.email),
  full_name = CASE WHEN NULLIF(EXCLUDED.full_name, '') IS NOT NULL THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
  is_verified = GREATEST(COALESCE(public.profiles.is_verified, FALSE), COALESCE(EXCLUDED.is_verified, FALSE)),
  updated_at = NOW();

INSERT INTO public.user_balances (user_id)
SELECT u.id FROM auth.users u
WHERE lower(split_part(trim(COALESCE(u.email::text, '')), '@', 1)) = 'esknexuspro'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.retailer_profiles (user_id)
SELECT u.id FROM auth.users u
WHERE lower(split_part(trim(COALESCE(u.email::text, '')), '@', 1)) = 'esknexuspro'
ON CONFLICT (user_id) DO NOTHING;

-- Verify (run in SQL editor):
-- SELECT u.email, p.trading_user_level, p.retailer_credit_seller
-- FROM auth.users u INNER JOIN public.profiles p ON p.id = u.id
-- WHERE split_part(lower(trim(u.email::text)), '@', 1) IN ('deanwhisley2', 'esknexuspro');
