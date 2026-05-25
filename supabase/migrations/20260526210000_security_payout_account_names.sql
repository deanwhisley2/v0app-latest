-- Registered account holder names for mobile payout numbers (withdrawal desk audit).

alter table public.user_security_profiles
  add column if not exists deposit_account_names text,
  add column if not exists withdrawal_account_names text;

comment on column public.user_security_profiles.deposit_account_names is
  'Legal / registered names on the deposit mobile-money line (comma-separated if multiple).';
comment on column public.user_security_profiles.withdrawal_account_names is
  'Legal / registered names on the withdrawal mobile-money line (comma-separated if multiple).';
