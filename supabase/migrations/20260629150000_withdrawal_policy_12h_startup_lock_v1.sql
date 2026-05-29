-- Withdrawal policy v1 (application-enforced; documented for ops/audit).
-- Cooldown: one withdrawal_requests row per user per rolling 12h (see WITHDRAWAL_COOLDOWN_MS).
-- New-member welcome: startup_capital_locked_usd is non-withdrawable when startup_bonus_received_at is set.
-- Legacy startup_capital_granted_at (referral milestone) does not impose the welcome lock.
-- Other users: minimum Nexus Main retain $1.50 (DRC may retain $3 when no welcome lock).

comment on column public.profiles.startup_capital_locked_usd is
  'Non-withdrawable welcome principal (USD). Tradable. Applies only when startup_bonus_received_at is set.';

comment on column public.profiles.startup_bonus_received_at is
  'Timestamp when new-member welcome bonus was granted; gates startup_capital_locked_usd withdraw exclusion.';
