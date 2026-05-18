BEGIN;

CREATE TABLE IF NOT EXISTS public.signup_corridor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  email_domain text,
  action text NOT NULL CHECK (action IN ('register', 'send_verification', 'verify_code')),
  selected_country char(2) NOT NULL,
  detected_country char(2),
  ip_address text,
  blocked boolean NOT NULL DEFAULT false,
  user_agent text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.signup_corridor_events IS
  'Signup / verification geo corridor audit — IP vs selected operating country. Service role only.';

CREATE INDEX IF NOT EXISTS signup_corridor_events_created_at_idx
  ON public.signup_corridor_events (created_at DESC);

CREATE INDEX IF NOT EXISTS signup_corridor_events_blocked_idx
  ON public.signup_corridor_events (blocked, created_at DESC)
  WHERE blocked = true;

ALTER TABLE public.signup_corridor_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.signup_corridor_events FROM anon, authenticated;
GRANT ALL ON TABLE public.signup_corridor_events TO service_role;

COMMIT;
