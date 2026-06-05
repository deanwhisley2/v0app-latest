BEGIN;

ALTER TABLE public.auth_email_delivery_events
  ADD COLUMN IF NOT EXISTS message_id text;

COMMENT ON COLUMN public.auth_email_delivery_events.message_id IS
  'SMTP Message-ID when provider accepted the message (best-effort).';

CREATE INDEX IF NOT EXISTS auth_email_delivery_events_message_id_idx
  ON public.auth_email_delivery_events (message_id)
  WHERE message_id IS NOT NULL;

COMMIT;
