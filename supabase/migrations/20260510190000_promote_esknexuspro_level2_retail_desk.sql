-- Designated Level-2 retail desk: esknexuspro (email local part, any domain).
-- Idempotent: creates missing profile + balance + retailer_profiles shell; upgrades level/flags if row exists.

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
