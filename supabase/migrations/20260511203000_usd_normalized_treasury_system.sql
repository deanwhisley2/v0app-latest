-- ============================================
-- USD-NORMALIZED TREASURY SYSTEM (non-destructive rollout)
-- ============================================

create extension if not exists pgcrypto;

-- Treasury is USD-only.
create table if not exists public.treasury_balances (
  id bigserial primary key,
  wallet_type text not null check (wallet_type in ('MAIN_TREASURY', 'OPERATIONAL', 'RESERVE')),
  currency text not null default 'USD' check (currency = 'USD'),
  amount numeric(20,2) not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (wallet_type)
);

comment on table public.treasury_balances is 'USD-only treasury pools. No local currency storage allowed.';

-- Keep user-local balances separate from treasury pools.
create table if not exists public.user_local_balances (
  user_id uuid not null,
  wallet_type text not null check (wallet_type in ('NEXUS_MAIN', 'RETAIL', 'EARNINGS')),
  currency text not null,
  amount numeric(20,2) not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  primary key (user_id, wallet_type, currency)
);

comment on table public.user_local_balances is 'User balances stored in each users local currency context.';

create table if not exists public.unified_ledger (
  id bigserial primary key,
  transaction_id uuid not null,
  entity_type text not null check (entity_type in ('USER', 'TREASURY')),
  entity_id text not null,
  wallet_type text not null,
  original_amount numeric(20,2) not null,
  original_currency text not null,
  usd_amount numeric(20,2) not null,
  usd_rate numeric(20,6) not null check (usd_rate > 0),
  operation text not null check (operation in ('CREDIT', 'DEBIT')),
  reference_id text not null,
  reason text not null,
  initiated_by uuid not null,
  conversion_timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_unified_ledger_tx on public.unified_ledger(transaction_id);
create index if not exists idx_unified_ledger_entity on public.unified_ledger(entity_type, entity_id);

create table if not exists public.pending_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  user_id uuid not null,
  amount_local numeric(20,2) not null,
  currency text not null,
  usd_amount numeric(20,2) not null,
  usd_rate numeric(20,6) not null,
  status text not null default 'PENDING',
  created_at timestamptz not null default now()
);

create index if not exists idx_pending_requests_status on public.pending_requests(status);
create index if not exists idx_pending_requests_user on public.pending_requests(user_id);

-- Ensure FX exists (from previous migration); otherwise create.
create table if not exists public.fx_rates (
  id bigserial primary key,
  from_currency text not null,
  to_currency text not null,
  rate numeric(20,6) not null check (rate > 0),
  source text not null default 'SYSTEM',
  effective_from timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  unique (from_currency, to_currency)
);

insert into public.treasury_balances (wallet_type, amount)
values ('MAIN_TREASURY', 0)
on conflict (wallet_type) do nothing;

insert into public.fx_rates (from_currency, to_currency, rate, source)
values
  ('USD', 'UGX', 3750, 'SYSTEM'),
  ('USD', 'KES', 130, 'SYSTEM'),
  ('USD', 'NGN', 1500, 'SYSTEM'),
  ('UGX', 'USD', 1.0 / 3750.0, 'SYSTEM'),
  ('KES', 'USD', 1.0 / 130.0, 'SYSTEM'),
  ('NGN', 'USD', 1.0 / 1500.0, 'SYSTEM')
on conflict (from_currency, to_currency) do nothing;

create or replace function public.update_treasury_usd(
  p_operation text,
  p_usd_amount numeric(20,2),
  p_wallet_type text,
  p_transaction_id uuid,
  p_reference_id text,
  p_reason text,
  p_initiated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_balance numeric(20,2);
  v_new_balance numeric(20,2);
begin
  if p_usd_amount is null or p_usd_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Invalid USD amount');
  end if;

  select amount into v_current_balance
  from public.treasury_balances
  where wallet_type = p_wallet_type
  for update;

  if not found then
    insert into public.treasury_balances (wallet_type, amount) values (p_wallet_type, 0)
    on conflict (wallet_type) do nothing;
    v_current_balance := 0;
  end if;

  if p_operation = 'CREDIT' then
    v_new_balance := v_current_balance + p_usd_amount;
  elsif p_operation = 'DEBIT' then
    if v_current_balance < p_usd_amount then
      return jsonb_build_object('success', false, 'error', 'Insufficient treasury balance', 'current', v_current_balance);
    end if;
    v_new_balance := v_current_balance - p_usd_amount;
  else
    return jsonb_build_object('success', false, 'error', 'Invalid operation');
  end if;

  update public.treasury_balances
  set amount = v_new_balance, updated_at = now(), version = version + 1
  where wallet_type = p_wallet_type;

  insert into public.unified_ledger (
    transaction_id, entity_type, entity_id, wallet_type,
    original_amount, original_currency, usd_amount, usd_rate,
    operation, reference_id, reason, initiated_by
  ) values (
    p_transaction_id, 'TREASURY', 'treasury_pool', p_wallet_type,
    p_usd_amount, 'USD', p_usd_amount, 1,
    p_operation, p_reference_id, p_reason, p_initiated_by
  );

  return jsonb_build_object('success', true, 'new_balance', v_new_balance);
end;
$$;

create or replace function public.update_user_balance_local(
  p_user_id uuid,
  p_wallet_type text,
  p_currency text,
  p_operation text,
  p_amount_local numeric(20,2),
  p_transaction_id uuid,
  p_reference_id text,
  p_reason text,
  p_initiated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_balance numeric(20,2);
  v_new_balance numeric(20,2);
begin
  if p_amount_local is null or p_amount_local <= 0 then
    return jsonb_build_object('success', false, 'error', 'Invalid local amount');
  end if;

  select amount into v_current_balance
  from public.user_local_balances
  where user_id = p_user_id and wallet_type = p_wallet_type and currency = upper(trim(p_currency))
  for update;

  if not found then
    insert into public.user_local_balances (user_id, wallet_type, currency, amount)
    values (p_user_id, p_wallet_type, upper(trim(p_currency)), 0)
    on conflict do nothing;
    v_current_balance := 0;
  end if;

  if p_operation = 'CREDIT' then
    v_new_balance := v_current_balance + p_amount_local;
  elsif p_operation = 'DEBIT' then
    if v_current_balance < p_amount_local then
      return jsonb_build_object('success', false, 'error', 'Insufficient user balance', 'current', v_current_balance);
    end if;
    v_new_balance := v_current_balance - p_amount_local;
  else
    return jsonb_build_object('success', false, 'error', 'Invalid operation');
  end if;

  update public.user_local_balances
  set amount = v_new_balance, updated_at = now(), version = version + 1
  where user_id = p_user_id and wallet_type = p_wallet_type and currency = upper(trim(p_currency));

  return jsonb_build_object('success', true, 'new_balance', v_new_balance);
end;
$$;

alter table public.treasury_balances enable row level security;
alter table public.user_local_balances enable row level security;
alter table public.unified_ledger enable row level security;
alter table public.pending_requests enable row level security;

revoke all on table public.treasury_balances from anon, authenticated;
revoke all on table public.user_local_balances from anon, authenticated;
revoke all on table public.unified_ledger from anon, authenticated;
revoke all on table public.pending_requests from anon, authenticated;

grant all on table public.treasury_balances to service_role;
grant all on table public.user_local_balances to service_role;
grant all on table public.unified_ledger to service_role;
grant all on table public.pending_requests to service_role;

revoke all on function public.update_treasury_usd(text, numeric, text, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_user_balance_local(uuid, text, text, text, numeric, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.update_treasury_usd(text, numeric, text, uuid, text, text, uuid) to service_role;
grant execute on function public.update_user_balance_local(uuid, text, text, text, numeric, uuid, text, text, uuid) to service_role;

