-- Crypto deposit: fee-tolerant crediting, 6.5% compensation, security audit columns.

alter table public.crypto_deposit_requests
  add column if not exists credited_principal_usd numeric(20, 2),
  add column if not exists compensation_usd numeric(20, 2) not null default 0,
  add column if not exists total_credited_usd numeric(20, 2),
  add column if not exists chain_block_timestamp_ms bigint,
  add column if not exists security_flag text,
  add column if not exists auto_approved boolean,
  add column if not exists tx_hash_locked_at timestamptz;

comment on column public.crypto_deposit_requests.amount_usd is
  'User-declared USD intent at submit time; on-chain received amount is authoritative for credit.';

create table if not exists public.crypto_deposit_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  deposit_request_id uuid references public.crypto_deposit_requests(id) on delete set null,
  event_kind text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  tx_hash text,
  message text,
  details jsonb,
  created_at timestamptz not null default now()
);

comment on table public.crypto_deposit_security_events is
  'Duplicate tx attempts, compensation farming signals, and other crypto deposit fraud indicators.';

create index if not exists crypto_deposit_security_events_created_idx
  on public.crypto_deposit_security_events (created_at desc);

create index if not exists crypto_deposit_security_events_kind_idx
  on public.crypto_deposit_security_events (event_kind, created_at desc);

alter table public.crypto_deposit_security_events enable row level security;

drop policy if exists "crypto_deposit_security_events_no_client" on public.crypto_deposit_security_events;
create policy "crypto_deposit_security_events_no_client"
  on public.crypto_deposit_security_events for all to authenticated
  using (false) with check (false);

-- Permanent lock: credited rows must keep tx_hash unique (existing index covers all statuses).
