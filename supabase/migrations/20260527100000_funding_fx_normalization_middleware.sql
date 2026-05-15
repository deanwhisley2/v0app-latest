-- FX normalization middleware: audit trail for local → USD → local (display) without acting as a retailer.
-- Does NOT touch retailer_profiles, retail_balance, or retailer transaction history.

create table if not exists public.funding_fx_normalization (
  id uuid primary key default gen_random_uuid(),
  fund_request_id uuid not null references public.retailer_fund_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  routing_lane text not null check (
    routing_lane in (
      'official_corridor',
      'retailer_desk',
      'admin_direct',
      'legacy_admin'
    )
  ),
  amount_input_local numeric(24, 4),
  input_currency text,
  local_per_usd numeric(24, 8) not null check (local_per_usd > 0),
  rate_date date not null,
  rate_source text not null default 'daily_fx_policy_v1',
  amount_usd_normalized numeric(20, 2) not null check (amount_usd_normalized > 0),
  created_at timestamptz not null default now(),
  settled_amount_usd numeric(20, 2),
  settled_local_equivalent numeric(24, 4),
  settled_at timestamptz,
  settled_by uuid references auth.users(id) on delete set null
);

create unique index if not exists funding_fx_normalization_fund_request_id_uq
  on public.funding_fx_normalization (fund_request_id);

create index if not exists funding_fx_normalization_user_created_idx
  on public.funding_fx_normalization (user_id, created_at desc);

comment on table public.funding_fx_normalization is
  'Internal FX bridge: customer local input → normalized USD for treasury / L5; optional settled local equivalent for messaging. Not a retailer ledger.';

alter table public.funding_fx_normalization enable row level security;

revoke all on table public.funding_fx_normalization from public;
grant select, insert, update, delete on table public.funding_fx_normalization to service_role;
