-- Passwordless magic-link login tokens (service_role only; hashed at rest).

CREATE TABLE IF NOT EXISTS public.auth_magic_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_ip inet,
  user_agent text,
  CONSTRAINT auth_magic_link_tokens_token_hash_key UNIQUE (token_hash),
  CONSTRAINT auth_magic_link_tokens_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS auth_magic_link_tokens_email_created_idx
  ON public.auth_magic_link_tokens (lower(email), created_at DESC);

CREATE INDEX IF NOT EXISTS auth_magic_link_tokens_expires_idx
  ON public.auth_magic_link_tokens (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.auth_magic_link_tokens ENABLE ROW LEVEL SECURITY;

-- No policies: only service_role (server routes) may read/write.

COMMENT ON TABLE public.auth_magic_link_tokens IS
  'Single-use magic link hashes for passwordless login; raw tokens never stored.';
