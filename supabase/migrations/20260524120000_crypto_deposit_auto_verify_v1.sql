-- Automated USDT TRC20 deposits to TronLink receive wallet + esknexuspro single Airtel merchant desk.

create table if not exists public.crypto_deposit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  amount_usd numeric(20, 2) not null check (amount_usd > 0),
  tx_hash text not null,
  receive_address text not null,
  token_contract text not null default 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  chain text not null default 'tron',
  status text not null default 'pending' check (
    status in (
      'pending',
      'verifying',
      'awaiting_confirmations',
      'verified',
      'credited',
      'failed',
      'rejected',
      'manual_review'
    )
  ),
  on_chain_amount_usdt numeric(24, 6),
  confirmations integer not null default 0,
  min_confirmations integer not null default 19,
  failure_reason text,
  credited_at timestamptz,
  verified_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crypto_deposit_requests is
  'USDT TRC20 deposit intents verified on-chain via TronGrid; auto-credit to Nexus Main after confirmations.';

create unique index if not exists crypto_deposit_requests_tx_hash_unique
  on public.crypto_deposit_requests (lower(trim(tx_hash)));

create index if not exists crypto_deposit_requests_user_status_idx
  on public.crypto_deposit_requests (user_id, status, created_at desc);

create index if not exists crypto_deposit_requests_poll_idx
  on public.crypto_deposit_requests (status, created_at)
  where status in ('pending', 'verifying', 'awaiting_confirmations', 'verified');

create table if not exists public.crypto_deposit_verification_logs (
  id uuid primary key default gen_random_uuid(),
  deposit_request_id uuid not null references public.crypto_deposit_requests(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system' check (actor_type in ('system', 'user', 'admin', 'cron')),
  actor_id uuid,
  result_code text,
  message text,
  payload jsonb,
  created_at timestamptz not null default now()
);

comment on table public.crypto_deposit_verification_logs is
  'Append-only audit trail for TronGrid polls, verification outcomes, and admin overrides.';

create index if not exists crypto_deposit_verification_logs_deposit_idx
  on public.crypto_deposit_verification_logs (deposit_request_id, created_at desc);

alter table public.crypto_deposit_requests enable row level security;
alter table public.crypto_deposit_verification_logs enable row level security;

drop policy if exists "crypto_deposit_requests_select_own" on public.crypto_deposit_requests;
create policy "crypto_deposit_requests_select_own"
  on public.crypto_deposit_requests for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "crypto_deposit_verification_logs_select_own" on public.crypto_deposit_verification_logs;
create policy "crypto_deposit_verification_logs_select_own"
  on public.crypto_deposit_verification_logs for select to authenticated
  using (
    exists (
      select 1 from public.crypto_deposit_requests r
      where r.id = deposit_request_id and r.user_id = auth.uid()
    )
  );

-- esknexuspro: single Airtel Money Uganda merchant line (retailer-responsible, not L5 admin 7095287).
update public.retailer_profiles rp
set
  payment_numbers =
    '[
      {
        "label": "Airtel Money Uganda",
        "value": "7095290",
        "payment_type": "airtel_merchant_ug",
        "merchant_id": "7095290",
        "merchant_name": "Nexus Pro2"
      }
    ]'::jsonb,
  registered_payee_names = 'Pegasus Technologies',
  estimated_response_minutes = coalesce(estimated_response_minutes, 45),
  liquidity_status = 'active',
  under_review = false,
  is_country_retailer = true,
  country_code = coalesce(nullif(trim(upper(country_code)), ''), 'UG'),
  updated_at = now()
from public.profiles p
where p.id = rp.user_id
  and lower(split_part(trim(coalesce(p.email::text, '')), '@', 1)) = 'esknexuspro';
