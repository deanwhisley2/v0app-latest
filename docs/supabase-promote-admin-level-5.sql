-- -----------------------------------------------------------------------------
-- Promote a user to Level 5 admin (Nexus trading_user_level)
--
-- This app reads admin level from public.profiles.trading_user_level via
-- getTradingUserLevel() — NOT from auth.users.raw_app_meta_data.
-- Setting raw_app_meta_data.role / admin_level alone will NOT unlock Level 5 UI/API.
-- -----------------------------------------------------------------------------

-- Replace with the auth user id (same as profiles.id / auth.users.id).
-- Example: deanwhisley2@gmail.com → 0d7e383e-5012-4e86-9090-09bcc6458255
UPDATE public.profiles
SET
  trading_user_level = 5,
  updated_at = NOW()
WHERE id = '0d7e383e-5012-4e86-9090-09bcc6458255'::uuid;

-- Confirm (profiles.email may exist depending on your schema)
SELECT id, trading_user_level, retailer_credit_seller, updated_at
FROM public.profiles
WHERE id = '0d7e383e-5012-4e86-9090-09bcc6458255'::uuid;

-- Optional: keep auth metadata in sync for other tooling (does not drive Nexus RBAC today)
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'admin', 'admin_level', 5)
WHERE id = '0d7e383e-5012-4e86-9090-09bcc6458255'::uuid;
