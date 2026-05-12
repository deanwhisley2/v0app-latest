-- H1 + H6: retailer liquidity reservations (concurrency-safe holds) + immutable FX snapshot fields on fund requests.
-- Reservations apply only to local_mobile desk flows (retail_balance encumbrance). Legacy admin basin workflow unchanged.

-- -----------------------------------------------------------------------------
-- FX snapshot columns (H6)
-- -----------------------------------------------------------------------------
alter table public.retailer_fund_requests
  add column if not exists amount_input_local numeric(24, 6) null,
  add column if not exists input_currency text null,
  add column if not exists fx_rate_snapshot numeric(24, 12) null,
  add column if not exists amount_usd_locked numeric(18, 6) null,
  add column if not exists fx_locked_at timestamptz null,
  add column if not exists fx_quote_expires_at timestamptz null;

comment on column public.retailer_fund_requests.fx_rate_snapshot is
  'Immutable corridor FX at lock: local fiat units per 1 USD (matches app USD_TO_FX convention).';
comment on column public.retailer_fund_requests.amount_usd_locked is
  'Authoritative USD-equivalent settlement basis; approvals must use this, not live FX.';
comment on column public.retailer_fund_requests.fx_quote_expires_at is
  'Optional staleness window; expired quotes should be rejected or re-issued per policy.';

update public.retailer_fund_requests
set
  amount_usd_locked = coalesce(amount_usd_locked, amount::numeric),
  fx_locked_at = coalesce(fx_locked_at, created_at)
where amount_usd_locked is null;

alter table public.retailer_fund_requests
  alter column amount_usd_locked set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'retailer_fund_requests_amount_usd_locked_positive_chk'
  ) then
    alter table public.retailer_fund_requests
      add constraint retailer_fund_requests_amount_usd_locked_positive_chk
      check (amount_usd_locked > 0);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Reservation ledger (H1)
-- -----------------------------------------------------------------------------
create table if not exists public.retailer_liquidity_reservations (
  id uuid primary key default gen_random_uuid(),
  retailer_profile_id uuid not null references public.retailer_profiles (id) on delete cascade,
  fund_request_id uuid not null references public.retailer_fund_requests (id) on delete cascade,
  amount_usd numeric(18, 6) not null check (amount_usd > 0),
  state text not null check (state in ('active', 'released', 'consumed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  released_at timestamptz null,
  release_reason text null,
  unique (fund_request_id)
);

create index if not exists retailer_liquidity_reservations_retailer_active_idx
  on public.retailer_liquidity_reservations (retailer_profile_id)
  where state = 'active';

comment on table public.retailer_liquidity_reservations is
  'Atomic holds on retailer retail_balance at fund-request creation; released or consumed at terminal settlement.';

-- Backfill active reservations for existing open local_mobile desk requests only.
insert into public.retailer_liquidity_reservations (
  retailer_profile_id,
  fund_request_id,
  amount_usd,
  state,
  expires_at
)
select
  r.retailer_id,
  r.id,
  r.amount_usd_locked,
  'active',
  r.created_at + interval '72 hours'
from public.retailer_fund_requests r
where r.retailer_id is not null
  and r.fund_channel = 'local_mobile'
  and r.status in ('pending', 'under_review', 'appealed', 'escalated')
on conflict (fund_request_id) do nothing;

-- -----------------------------------------------------------------------------
-- Finalize reservation (release unused liquidity or mark consumed after retail debit)
-- -----------------------------------------------------------------------------
create or replace function public.finalize_retailer_liquidity_reservation(
  p_fund_request_id uuid,
  p_outcome text,
  p_release_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_state text;
begin
  if p_outcome is null or p_outcome not in ('released', 'consumed') then
    raise exception 'INVALID_RESERVATION_OUTCOME';
  end if;

  select id, state into v_id, v_state
  from public.retailer_liquidity_reservations
  where fund_request_id = p_fund_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_reservation');
  end if;

  if v_state <> 'active' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'not_active', 'state', v_state);
  end if;

  update public.retailer_liquidity_reservations
  set
    state = p_outcome,
    released_at = now(),
    release_reason = coalesce(
      p_release_reason,
      case when p_outcome = 'released' then 'released' else 'consumed_settlement' end
    )
  where id = v_id;

  return jsonb_build_object('ok', true, 'finalized', true, 'outcome', p_outcome);
end;
$$;

revoke all on function public.finalize_retailer_liquidity_reservation(uuid, text, text) from public;
grant execute on function public.finalize_retailer_liquidity_reservation(uuid, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Atomic fund-request insert + reservation (serialized via retailer balance row lock)
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
begin
  if p_amount_usd_locked is null or p_amount_usd_locked <= 0 then
    raise exception 'INVALID_AMOUNT_USD_LOCKED';
  end if;

  if p_fund_channel is distinct from 'local_mobile' then
    raise exception 'RESERVE_RPC_REQUIRES_LOCAL_MOBILE';
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

-- -----------------------------------------------------------------------------
-- Retail settlement: debit retail_balance + consume reservation in ONE transaction
-- -----------------------------------------------------------------------------
create or replace function public.transfer_retail_balance_to_customer_with_reservation(
  p_retailer_user_id uuid,
  p_customer_user_id uuid,
  p_amount numeric,
  p_fund_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res_amt numeric;
  v_locked numeric;
  v_xfer jsonb;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select r.amount_usd, fr.amount_usd_locked
  into v_res_amt, v_locked
  from public.retailer_liquidity_reservations r
  join public.retailer_fund_requests fr on fr.id = r.fund_request_id
  where r.fund_request_id = p_fund_request_id
    and r.state = 'active'
  for update of r;

  if not found then
    raise exception 'ACTIVE_RESERVATION_MISSING';
  end if;

  if abs(v_res_amt - p_amount) > 0.000001 or abs(coalesce(v_locked, 0) - p_amount) > 0.000001 then
    raise exception 'RESERVATION_AMOUNT_MISMATCH';
  end if;

  select public.transfer_retail_balance_to_customer(
    p_retailer_user_id,
    p_customer_user_id,
    p_amount
  ) into v_xfer;

  update public.retailer_liquidity_reservations
  set
    state = 'consumed',
    released_at = now(),
    release_reason = 'consumed_retail_settlement'
  where fund_request_id = p_fund_request_id
    and state = 'active';

  return coalesce(v_xfer, '{}'::jsonb) || jsonb_build_object('reservation_consumed', true);
end;
$$;

revoke all on function public.transfer_retail_balance_to_customer_with_reservation(uuid, uuid, numeric, uuid) from public;
grant execute on function public.transfer_retail_balance_to_customer_with_reservation(uuid, uuid, numeric, uuid) to service_role;

comment on function public.transfer_retail_balance_to_customer_with_reservation is
  'Retail funding: atomically debits retail_balance, credits customer, and consumes active liquidity reservation.';

-- -----------------------------------------------------------------------------
-- RLS (authenticated least-privilege SELECT; writes via service_role routes)
-- -----------------------------------------------------------------------------
alter table public.retailer_liquidity_reservations enable row level security;

grant select on table public.retailer_liquidity_reservations to authenticated;

drop policy if exists "retailer_liquidity_reservations_select_desk" on public.retailer_liquidity_reservations;
create policy "retailer_liquidity_reservations_select_desk"
  on public.retailer_liquidity_reservations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.retailer_profiles rp
      where rp.id = retailer_liquidity_reservations.retailer_profile_id
        and rp.user_id = auth.uid()
    )
  );

drop policy if exists "retailer_liquidity_reservations_select_customer_request" on public.retailer_liquidity_reservations;
create policy "retailer_liquidity_reservations_select_customer_request"
  on public.retailer_liquidity_reservations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.retailer_fund_requests fr
      where fr.id = retailer_liquidity_reservations.fund_request_id
        and fr.user_id = auth.uid()
    )
  );

drop policy if exists "retailer_liquidity_reservations_select_admin" on public.retailer_liquidity_reservations;
create policy "retailer_liquidity_reservations_select_admin"
  on public.retailer_liquidity_reservations
  for select
  to authenticated
  using (public.auth_is_level5());
