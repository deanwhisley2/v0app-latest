BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_email_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  email_domain text,
  channel text NOT NULL CHECK (
    channel IN ('register', 'send_verification', 'recovery', 'magic_link', 'settings')
  ),
  outcome text NOT NULL CHECK (outcome IN ('sent', 'deferred', 'failed', 'skipped')),
  error_message text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.auth_email_delivery_events IS
  'Transactional auth email audit — register, verification resend, recovery, magic link. Service role only.';

CREATE INDEX IF NOT EXISTS auth_email_delivery_events_created_at_idx
  ON public.auth_email_delivery_events (created_at DESC);

CREATE INDEX IF NOT EXISTS auth_email_delivery_events_channel_outcome_idx
  ON public.auth_email_delivery_events (channel, outcome, created_at DESC);

ALTER TABLE public.auth_email_delivery_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.auth_email_delivery_events FROM anon, authenticated;
GRANT ALL ON TABLE public.auth_email_delivery_events TO service_role;

COMMIT;
