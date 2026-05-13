-- Container Mode: authoritative trader catalog + per-user fix-band persistence (service-role writes).
-- Seed rows live in 20260513140100_container_operational_seed_personas.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.container_trader_personas (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('copy', 'fix')),
  display_name text NOT NULL,
  avatar_initials text NOT NULL DEFAULT '?',
  win_rate_pct numeric(6, 2),
  risk_class text CHECK (risk_class IN ('Low', 'Medium', 'High')),
  monthly_return_pct numeric(10, 4) NOT NULL DEFAULT 0,
  speciality text,
  description text,
  strategies jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  fix_band_required int NOT NULL DEFAULT 1 CHECK (fix_band_required IN (1, 2)),
  unlock_rule text NOT NULL DEFAULT 'none',
  unlock_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_ids text[] NOT NULL DEFAULT '{}'::text[]
);

COMMENT ON TABLE public.container_trader_personas IS
  'Authoritative Container personas — APIs validate trader_persona_id against this table only.';

ALTER TABLE public.container_trader_personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_container_trader_personas" ON public.container_trader_personas;
CREATE POLICY "authenticated_read_container_trader_personas"
  ON public.container_trader_personas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_read_container_trader_personas" ON public.container_trader_personas;
CREATE POLICY "anon_read_container_trader_personas"
  ON public.container_trader_personas FOR SELECT TO anon USING (true);

GRANT SELECT ON public.container_trader_personas TO authenticated, anon;

CREATE TABLE IF NOT EXISTS public.user_container_operational (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  fix_band_max int NOT NULL DEFAULT 1 CHECK (fix_band_max IN (1, 2)),
  fix_band_2_unlocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_container_operational IS
  'Persists max unlocked fixed-trade band (1 baseline, 2 advanced); server computes eligibility and promotes rows.';

ALTER TABLE public.user_container_operational ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_own_user_container_operational" ON public.user_container_operational;
CREATE POLICY "authenticated_select_own_user_container_operational"
  ON public.user_container_operational FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON public.user_container_operational TO authenticated;

COMMIT;
