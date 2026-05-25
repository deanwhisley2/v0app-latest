-- Nexus Security Code system: profiles, change appeals, institutional payout fields.

create table if not exists public.user_security_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  security_code_hash text,
  security_code_set_at timestamptz,
  deposit_number text,
  withdrawal_number text,
  crypto_wallet text,
  payout_method text not null default 'mobile_money',
  last_sensitive_change_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_security_profiles
  drop constraint if exists user_security_profiles_payout_method_check;

alter table public.user_security_profiles
  add constraint user_security_profiles_payout_method_check
  check (payout_method in ('mobile_money', 'crypto_trc20'));

comment on table public.user_security_profiles is
  'Institutional security: hashed 6-digit code, separate deposit/withdrawal numbers, optional USDT TRC20 wallet.';
comment on column public.user_security_profiles.security_code_hash is
  'PBKDF2 hash only — never store plaintext code.';

create table if not exists public.security_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null,
  old_value_masked text,
  new_value_masked text,
  status text not null default 'open',
  thread_id uuid references public.operational_support_threads(id) on delete set null,
  assigned_admin_id uuid references auth.users(id) on delete set null,
  admin_notes text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.security_change_requests
  drop constraint if exists security_change_requests_type_check;

alter table public.security_change_requests
  add constraint security_change_requests_type_check
  check (
    request_type in (
      'deposit_number',
      'withdrawal_number',
      'crypto_wallet',
      'security_code',
      'payout_method'
    )
  );

alter table public.security_change_requests
  drop constraint if exists security_change_requests_status_check;

alter table public.security_change_requests
  add constraint security_change_requests_status_check
  check (
    status in (
      'open',
      'verifying',
      'pending_code_confirmation',
      'approved',
      'rejected',
      'closed'
    )
  );

create index if not exists security_change_requests_user_idx
  on public.security_change_requests (user_id, created_at desc);

create index if not exists security_change_requests_status_idx
  on public.security_change_requests (status, created_at desc)
  where status not in ('approved', 'rejected', 'closed');

alter table public.user_security_profiles enable row level security;
alter table public.security_change_requests enable row level security;

drop policy if exists "user_security_profiles_select_own" on public.user_security_profiles;
create policy "user_security_profiles_select_own"
  on public.user_security_profiles for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "security_change_requests_select_own" on public.security_change_requests;
create policy "security_change_requests_select_own"
  on public.security_change_requests for select to authenticated
  using (user_id = auth.uid());

grant select on public.user_security_profiles to authenticated;
grant select on public.security_change_requests to authenticated;
grant all on public.user_security_profiles to service_role;
grant all on public.security_change_requests to service_role;

-- Extend support thread categories for SECURITY_UPDATE appeals.
alter table public.operational_support_threads
  drop constraint if exists operational_support_threads_category_check;

alter table public.operational_support_threads
  add constraint operational_support_threads_category_check
  check (
    category in (
      'general',
      'funding_dispute',
      'withdrawal_dispute',
      'appeal',
      'security',
      'security_update',
      'retailer',
      'crypto_dispute',
      'assistant_escalation',
      'transaction_review',
      'operational_complaint',
      'payout_dispute',
      'stuck_trade',
      'settlement_failure',
      'locked_balance',
      'verification_complaint'
    )
  );

alter table public.operational_support_threads
  drop constraint if exists operational_support_threads_linked_kind_check;

alter table public.operational_support_threads
  add constraint operational_support_threads_linked_kind_check
  check (
    linked_kind is null
    or linked_kind in (
      'retailer_fund_request',
      'withdrawal_request',
      'crypto_deposit_request',
      'trade_session',
      'copy_trade_session',
      'security_change_request'
    )
  );
