-- -----------------------------------------------------------------------------
-- Operational preferences blob: notifications UI inbox/history + future UI chrome (cross-device)
-- Merge/save paths: POST /api/user/operational-preferences — GET via operational-bootstrap.
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS operational_preferences JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.operational_preferences IS
  '{ "v": 1, "notifications": { "inbox": [], "history": [] }, "uiChrome": {} } — server merges patches.';

CREATE INDEX IF NOT EXISTS profiles_operational_preferences_not_null
  ON public.profiles (id)
  WHERE operational_preferences IS NOT NULL;
