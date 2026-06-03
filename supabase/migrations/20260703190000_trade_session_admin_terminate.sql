-- Admin early termination audit (internal; never shown to users).

ALTER TABLE public.trade_sessions
  ADD COLUMN IF NOT EXISTS admin_terminated_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_terminated_by uuid REFERENCES auth.users (id);

COMMENT ON COLUMN public.trade_sessions.admin_terminated_at IS
  'Admin closed session early — participants settled at full session weight.';
