-- Separate MTN and Airtel mobile-money lines (deposit + withdrawal) per user.

alter table public.user_security_profiles
  add column if not exists mtn_deposit_number text,
  add column if not exists mtn_deposit_account_names text,
  add column if not exists airtel_deposit_number text,
  add column if not exists airtel_deposit_account_names text,
  add column if not exists mtn_withdrawal_number text,
  add column if not exists mtn_withdrawal_account_names text,
  add column if not exists airtel_withdrawal_number text,
  add column if not exists airtel_withdrawal_account_names text;

comment on column public.user_security_profiles.mtn_deposit_number is
  'MTN mobile money number used for deposits (Uganda/region).';
comment on column public.user_security_profiles.airtel_deposit_number is
  'Airtel Money number used for deposits.';
comment on column public.user_security_profiles.mtn_withdrawal_number is
  'MTN mobile money number used for withdrawals.';
comment on column public.user_security_profiles.airtel_withdrawal_number is
  'Airtel Money number used for withdrawals.';

-- Backfill network lines from legacy single deposit/withdrawal columns when present.
update public.user_security_profiles
set
  mtn_deposit_number = coalesce(mtn_deposit_number, deposit_number),
  mtn_deposit_account_names = coalesce(mtn_deposit_account_names, deposit_account_names),
  mtn_withdrawal_number = coalesce(mtn_withdrawal_number, withdrawal_number),
  mtn_withdrawal_account_names = coalesce(mtn_withdrawal_account_names, withdrawal_account_names)
where deposit_number is not null or withdrawal_number is not null;
