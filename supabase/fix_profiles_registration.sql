-- =============================================================================
-- Fix duplicate profiles_pkey during registration
--
-- Cause: BOTH (A) trigger on auth.users INSERT and (B) Next.js insert run for same id.
-- App fix: use upsert onConflict id (see app/auth/register/page.tsx).
--
-- Optional DB hardening: trigger uses ON CONFLICT DO NOTHING so duplicate inserts never error.
-- =============================================================================

-- Grants (safe to re-run)
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO service_role;

-- Trigger function: create stub profile if missing; never fail on duplicate id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, avatar_url, is_verified, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NULL,
    FALSE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Optional RLS (enable after grants + policies tested)
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
-- CREATE POLICY "profiles_select_own"
--   ON public.profiles FOR SELECT TO authenticated
--   USING (id = auth.uid());
--
-- DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
-- CREATE POLICY "profiles_insert_own"
--   ON public.profiles FOR INSERT TO authenticated
--   WITH CHECK (id = auth.uid());
--
-- DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
-- CREATE POLICY "profiles_update_own"
--   ON public.profiles FOR UPDATE TO authenticated
--   USING (id = auth.uid())
--   WITH CHECK (id = auth.uid());

-- =============================================================================
-- destructive_reset_optional.sql — ONLY if you intentionally wipe ALL accounts
-- WARNING: Deletes every auth user and profile. Irreversible.
-- =============================================================================
-- TRUNCATE auth.users CASCADE;  -- May be restricted on hosted Supabase; use Dashboard Users UI instead.
