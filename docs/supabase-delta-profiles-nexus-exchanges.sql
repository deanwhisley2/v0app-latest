-- =============================================================================
-- Delta: canonical exchange bindings on profiles (cross-device SSOT)
-- Apply in Supabase SQL Editor if not already present.
-- App reads/writes via service role in /api/user/* after Bearer auth.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nexus_exchanges JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.nexus_exchanges IS
  'Canonical stored exchange connection payload (same shape as client nexus_exchanges / user_metadata mirror). Treat as secret.';

CREATE INDEX IF NOT EXISTS profiles_nexus_exchanges_not_null
  ON public.profiles (id)
  WHERE nexus_exchanges IS NOT NULL;
