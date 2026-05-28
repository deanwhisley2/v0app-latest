-- Platform economy + security refresh:
-- - First deposit bonus (one-time) tracking
-- - Referral reward on referee first trade tracking
-- - Startup capital locked principal tracking

alter table public.profiles
  add column if not exists first_deposit_bonus_applied_at timestamptz null,
  add column if not exists referral_first_trade_reward_at timestamptz null,
  add column if not exists startup_capital_locked_usd numeric not null default 0;

comment on column public.profiles.first_deposit_bonus_applied_at is
  'Set when the one-time 20% first-deposit bonus has been credited.';

comment on column public.profiles.referral_first_trade_reward_at is
  'Set on the referee after the referrer receives the one-time referral reward triggered by referee first trade.';

comment on column public.profiles.startup_capital_locked_usd is
  'Company-provided startup capital principal locked against withdrawal calculations.';

create index if not exists profiles_first_deposit_bonus_idx
  on public.profiles (first_deposit_bonus_applied_at)
  where first_deposit_bonus_applied_at is not null;

create index if not exists profiles_referral_first_trade_reward_idx
  on public.profiles (referral_first_trade_reward_at)
  where referral_first_trade_reward_at is not null;
