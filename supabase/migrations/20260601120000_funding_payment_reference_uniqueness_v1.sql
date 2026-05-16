-- Global funding payment reference uniqueness (crypto tx hash, MoMo IDs, bank refs).
-- One normalized reference = one funding event across all channels.

create or replace function public.normalize_funding_payment_reference(p_text text)
returns text
language sql
immutable
as $$
  select nullif(
    case
      when length(trim(coalesce(p_text, ''))) = 0 then null::text
      when regexp_replace(lower(trim(p_text)), '\s+', '', 'g') ~ '^[a-f0-9]{64}$'
        then regexp_replace(lower(trim(p_text)), '\s+', '', 'g')
      else upper(
        regexp_replace(
          regexp_replace(trim(p_text), '\s+', '', 'g'),
          '[^0-9A-Za-z]',
          '',
          'g'
        )
      )
    end,
    ''
  );
$$;

comment on function public.normalize_funding_payment_reference(text) is
  'Canonical key for payment references: 64-char hex lower (TRON tx) or uppercase alphanumeric (MoMo/bank).';

-- -----------------------------------------------------------------------------
-- Registry (cross-table global uniqueness)
-- -----------------------------------------------------------------------------
create table if not exists public.funding_payment_reference_registry (
  id uuid primary key default gen_random_uuid(),
  reference_normalized text not null,
  reference_kind text not null check (reference_kind in ('crypto_tx', 'payment_ref')),
  source_table text not null,
  source_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status_snapshot text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint funding_payment_reference_registry_ref_unique unique (reference_normalized)
);

create index if not exists funding_payment_reference_registry_user_created_idx
  on public.funding_payment_reference_registry (user_id, created_at desc);

comment on table public.funding_payment_reference_registry is
  'Authoritative global lock for funding payment references; service_role writes only.';

alter table public.funding_payment_reference_registry enable row level security;

drop policy if exists "funding_payment_reference_registry_no_client" on public.funding_payment_reference_registry;
create policy "funding_payment_reference_registry_no_client"
  on public.funding_payment_reference_registry for all to authenticated using (false) with check (false);

-- -----------------------------------------------------------------------------
-- Security events (admin / ops — duplicate reuse attempts)
-- -----------------------------------------------------------------------------
create table if not exists public.funding_reference_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reference_normalized text not null,
  event_kind text not null check (event_kind in ('reuse_attempt', 'reuse_burst')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  attempt_count integer not null default 1,
  prior_user_id uuid null references auth.users (id) on delete set null,
  prior_source_table text null,
  prior_source_id uuid null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists funding_reference_security_events_user_created_idx
  on public.funding_reference_security_events (user_id, created_at desc);

create index if not exists funding_reference_security_events_ref_idx
  on public.funding_reference_security_events (reference_normalized, created_at desc);

comment on table public.funding_reference_security_events is
  'Duplicate funding reference reuse attempts; admin visibility only.';

alter table public.funding_reference_security_events enable row level security;

drop policy if exists "funding_reference_security_events_no_client" on public.funding_reference_security_events;
create policy "funding_reference_security_events_no_client"
  on public.funding_reference_security_events for all to authenticated using (false) with check (false);

-- -----------------------------------------------------------------------------
-- Normalized columns + per-table unique indexes (defense in depth)
-- -----------------------------------------------------------------------------
alter table public.retailer_fund_requests
  add column if not exists tx_reference_normalized text generated always as (
    public.normalize_funding_payment_reference(tx_reference)
  ) stored;

create unique index if not exists retailer_fund_requests_tx_reference_normalized_unique
  on public.retailer_fund_requests (tx_reference_normalized)
  where tx_reference_normalized is not null;

alter table public.retailer_admin_topup_requests
  add column if not exists crypto_tx_reference_normalized text generated always as (
    public.normalize_funding_payment_reference(crypto_tx_reference)
  ) stored;

drop index if exists retailer_admin_topup_requests_retailer_user_id_crypto_tx_reference_key;

create unique index if not exists retailer_admin_topup_crypto_tx_reference_normalized_unique
  on public.retailer_admin_topup_requests (crypto_tx_reference_normalized)
  where crypto_tx_reference_normalized is not null;

-- Backfill registry from historical rows (oldest row wins per normalized reference)
insert into public.funding_payment_reference_registry (
  reference_normalized,
  reference_kind,
  source_table,
  source_id,
  user_id,
  status_snapshot,
  created_at
)
select distinct on (r.tx_reference_normalized)
  r.tx_reference_normalized,
  case when length(r.tx_reference_normalized) = 64 then 'crypto_tx' else 'payment_ref' end,
  'retailer_fund_requests',
  r.id,
  r.user_id,
  r.status,
  r.created_at
from public.retailer_fund_requests r
where r.tx_reference_normalized is not null
  and length(r.tx_reference_normalized) >= 4
order by r.tx_reference_normalized, r.created_at asc
on conflict (reference_normalized) do nothing;

insert into public.funding_payment_reference_registry (
  reference_normalized,
  reference_kind,
  source_table,
  source_id,
  user_id,
  status_snapshot,
  created_at
)
select distinct on (public.normalize_funding_payment_reference(c.tx_hash))
  public.normalize_funding_payment_reference(c.tx_hash),
  'crypto_tx',
  'crypto_deposit_requests',
  c.id,
  c.user_id,
  c.status,
  c.created_at
from public.crypto_deposit_requests c
where public.normalize_funding_payment_reference(c.tx_hash) is not null
order by public.normalize_funding_payment_reference(c.tx_hash), c.created_at asc
on conflict (reference_normalized) do nothing;

insert into public.funding_payment_reference_registry (
  reference_normalized,
  reference_kind,
  source_table,
  source_id,
  user_id,
  status_snapshot,
  created_at
)
select distinct on (t.crypto_tx_reference_normalized)
  t.crypto_tx_reference_normalized,
  case when length(t.crypto_tx_reference_normalized) = 64 then 'crypto_tx' else 'payment_ref' end,
  'retailer_admin_topup_requests',
  t.id,
  t.retailer_user_id,
  t.status,
  t.created_at
from public.retailer_admin_topup_requests t
where t.crypto_tx_reference_normalized is not null
  and length(t.crypto_tx_reference_normalized) >= 4
order by t.crypto_tx_reference_normalized, t.created_at asc
on conflict (reference_normalized) do nothing;

-- -----------------------------------------------------------------------------
-- Desk fund RPC: reject duplicate references before insert
-- -----------------------------------------------------------------------------
create or replace function public.create_retailer_desk_fund_request_with_reserve(
  p_user_id uuid,
  p_retailer_profile_id uuid,
  p_amount_usd_locked numeric,
  p_amount_input_local numeric,
  p_input_currency text,
  p_fx_rate_snapshot numeric,
  p_tx_reference text,
  p_note text,
  p_fund_channel text,
  p_mobile_network text,
  p_payer_display_name text,
  p_payer_phone text,
  p_retailer_response_deadline_at timestamptz,
  p_escalated_to_admin boolean,
  p_fx_quote_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retailer_uid uuid;
  v_balance numeric;
  v_reserved numeric;
  v_req_id uuid;
  v_norm text;
begin
  if p_amount_usd_locked is null or p_amount_usd_locked <= 0 then
    raise exception 'INVALID_AMOUNT_USD_LOCKED';
  end if;

  if p_fund_channel is distinct from 'local_mobile' then
    raise exception 'RESERVE_RPC_REQUIRES_LOCAL_MOBILE';
  end if;

  v_norm := public.normalize_funding_payment_reference(p_tx_reference);
  if v_norm is null or length(v_norm) < 4 then
    raise exception 'FUNDING_REFERENCE_INVALID';
  end if;

  if exists (
    select 1 from public.funding_payment_reference_registry g where g.reference_normalized = v_norm
  ) then
    raise exception 'FUNDING_REFERENCE_ALREADY_USED';
  end if;

  select rp.user_id into v_retailer_uid
  from public.retailer_profiles rp
  where rp.id = p_retailer_profile_id;

  if v_retailer_uid is null then
    raise exception 'RETAILER_PROFILE_NOT_FOUND';
  end if;

  select coalesce(ub.retail_balance, 0) into v_balance
  from public.user_balances ub
  where ub.user_id = v_retailer_uid
  for update;

  if not found then
    raise exception 'RETAILER_USER_BALANCES_MISSING';
  end if;

  select coalesce(sum(r.amount_usd), 0) into v_reserved
  from public.retailer_liquidity_reservations r
  where r.retailer_profile_id = p_retailer_profile_id
    and r.state = 'active';

  if v_balance - v_reserved < p_amount_usd_locked then
    raise exception 'INSUFFICIENT_RETAIL_LIQUIDITY_AFTER_RESERVATIONS';
  end if;

  insert into public.retailer_fund_requests (
    user_id,
    retailer_id,
    official_corridor_route_id,
    amount,
    amount_usd_locked,
    amount_input_local,
    input_currency,
    fx_rate_snapshot,
    fx_locked_at,
    fx_quote_expires_at,
    tx_reference,
    note,
    status,
    fund_channel,
    mobile_network,
    payer_display_name,
    payer_phone,
    retailer_response_deadline_at,
    escalated_to_admin,
    updated_at
  )
  values (
    p_user_id,
    p_retailer_profile_id,
    null,
    round(p_amount_usd_locked::numeric, 2),
    p_amount_usd_locked,
    p_amount_input_local,
    nullif(trim(p_input_currency), ''),
    p_fx_rate_snapshot,
    now(),
    p_fx_quote_expires_at,
    p_tx_reference,
    nullif(trim(p_note), ''),
    'pending',
    p_fund_channel,
    nullif(trim(p_mobile_network), ''),
    nullif(trim(p_payer_display_name), ''),
    nullif(trim(p_payer_phone), ''),
    p_retailer_response_deadline_at,
    coalesce(p_escalated_to_admin, false),
    now()
  )
  returning id into v_req_id;

  insert into public.funding_payment_reference_registry (
    reference_normalized,
    reference_kind,
    source_table,
    source_id,
    user_id,
    status_snapshot
  )
  values (
    v_norm,
    case when length(v_norm) = 64 then 'crypto_tx' else 'payment_ref' end,
    'retailer_fund_requests',
    v_req_id,
    p_user_id,
    'pending'
  );

  insert into public.retailer_liquidity_reservations (
    retailer_profile_id,
    fund_request_id,
    amount_usd,
    state,
    expires_at
  )
  values (
    p_retailer_profile_id,
    v_req_id,
    p_amount_usd_locked,
    'active',
    now() + interval '72 hours'
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', v_req_id,
    'retailer_user_id', v_retailer_uid,
    'reserved_usd', p_amount_usd_locked
  );
end;
$$;

revoke all on function public.create_retailer_desk_fund_request_with_reserve(
  uuid, uuid, numeric, numeric, text, numeric, text, text, text, text, text, text, timestamptz, boolean, timestamptz
) from public;
grant execute on function public.create_retailer_desk_fund_request_with_reserve(
  uuid, uuid, numeric, numeric, text, numeric, text, text, text, text, text, text, timestamptz, boolean, timestamptz
) to service_role;
