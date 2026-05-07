-- -----------------------------------------------------------------------------
-- Operational workspace snapshot (cross-device command-center UI continuity)
-- Server-authoritative replica of structured dashboard/workspace state JSON.
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS operational_workspace JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.operational_workspace IS
  'Structured dashboard/command-center workspace (v=2 DashboardActivitySnapshot). Authoritative cross-device restore.';

CREATE INDEX IF NOT EXISTS profiles_operational_workspace_not_null
  ON public.profiles (id)
  WHERE operational_workspace IS NOT NULL;
