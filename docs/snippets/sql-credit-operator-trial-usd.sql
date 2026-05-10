-- One-off liquidity for Level-5 operator Nexus Main (adjust user_id if needed).
-- Example: deanwhisley2@gmail.com → public.profiles.id / auth.users.id
-- Re-run safe: adds another +10M — use only once or change the increment.

INSERT INTO public.user_balances (
  user_id,
  available_balance,
  withdrawal_pending_balance,
  active_container_earnings,
  container_withdrawable_earnings,
  lifetime_container_withdrawn,
  lifetime_container_fees,
  retail_balance
)
VALUES (
  '0d7e383e-5012-4e86-9090-09bcc6458255'::uuid,
  10000000,
  0,
  0,
  0,
  0,
  0,
  0
)
ON CONFLICT (user_id) DO UPDATE SET
  available_balance = public.user_balances.available_balance + EXCLUDED.available_balance,
  last_updated = NOW();
