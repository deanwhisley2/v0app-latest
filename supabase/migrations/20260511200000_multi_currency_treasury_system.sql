-- ============================================
-- MULTI-CURRENCY TREASURY SYSTEM (additive upgrade)
-- ============================================

create extension if not exists pgcrypto;

-- balances: add USD reference while keeping existing columns
alter table public.balances
  add column if not exists usd_equivalent numeric(20,2) not null default 0;

comment on table public.balances is 'Authoritative wallet balances by user/wallet/currency; usd_equivalent stores internal reference value.';
comment on column public.balances.amount is 'Balance in the row currency.';
comment on column public.balances.usd_equivalent is 'Internal USD reference for treasury controls and cross-currency reporting.';

-- ledger: add multi-currency traceability fields while preserving legacy fields
alter table public.ledger
  add column if not exists original_amount numeric(20,2),
  add column if not exists original_currency text,
  add column if not exists usd_converted_amount numeric(20,2),
  add column if not exists usd_conversion_rate numeric(20,6),
  add column if not exists balance_before_local numeric(20,2),
  add column if not exists balance_after_local numeric(20,2),
  add column if not exists balance_before_usd numeric(20,2),
  add column if not exists balance_after_usd numeric(20,2),
  add column if not exists conversion_timestamp timestamptz not null default now();

comment on table public.ledger is 'Append-only financial ledger with original and USD-converted traceability.';

-- Backfill new ledger columns for rows created by atomic_balance_update
update public.ledger
set
  original_amount = coalesce(original_amount, amount),
  original_currency = coalesce(original_currency, currency, 'UGX'),
  usd_converted_amount = coalesce(usd_converted_amount, amount),
  usd_conversion_rate = coalesce(usd_conversion_rate, 1),
  balance_before_local = coalesce(balance_before_local, balance_before),
  balance_after_local = coalesce(balance_after_local, balance_after),
  balance_before_usd = coalesce(balance_before_usd, balance_before),
  balance_after_usd = coalesce(balance_after_usd, balance_after),
  conversion_timestamp = coalesce(conversion_timestamp, created_at)
where
  original_amount is null
  or original_currency is null
  or usd_converted_amount is null
  or usd_conversion_rate is null
  or balance_before_local is null
  or balance_after_local is null
  or balance_before_usd is null
  or balance_after_usd is null;

-- fx rates table
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

create index if not exists idx_fx_rates_pair on public.fx_rates(from_currency, to_currency);

comment on table public.fx_rates is 'Authoritative FX conversion table.';
comment on column public.fx_rates.rate is 'Conversion multiplier from from_currency to to_currency.';

insert into public.fx_rates (from_currency, to_currency, rate, source)
values ('USD', 'UGX', 3750, 'SYSTEM')
on conflict (from_currency, to_currency) do nothing;

alter table public.fx_rates enable row level security;
revoke all on table public.fx_rates from anon, authenticated;
grant all on table public.fx_rates to service_role;

-- Atomic currency-aware mutation
create or replace function public.atomic_currency_balance_update(
  p_user_id uuid,
  p_wallet_type text,
  p_currency text,
  p_operation text,
  p_amount numeric(20,2),
  p_usd_rate numeric(20,6),
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
  v_currency text := upper(trim(coalesce(p_currency, 'UGX')));
  v_current_local numeric(20,2);
  v_current_usd numeric(20,2);
  v_new_local numeric(20,2);
  v_new_usd numeric(20,2);
  v_usd_amount numeric(20,2);
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Amount must be > 0');
  end if;
  if p_wallet_type not in ('TREASURY', 'RETAIL', 'NEXUS_MAIN', 'EARNINGS') then
    return jsonb_build_object('success', false, 'error', 'Invalid wallet_type');
  end if;
  if p_operation not in ('CREDIT', 'DEBIT') then
    return jsonb_build_object('success', false, 'error', 'Invalid operation');
  end if;
  if p_usd_rate is null or p_usd_rate <= 0 then
    return jsonb_build_object('success', false, 'error', 'Invalid USD rate');
  end if;

  select amount, usd_equivalent
    into v_current_local, v_current_usd
  from public.balances
  where user_id = p_user_id
    and wallet_type = p_wallet_type
    and currency = v_currency
  for update;

  if not found then
    insert into public.balances (user_id, wallet_type, currency, amount, usd_equivalent)
    values (p_user_id, p_wallet_type, v_currency, 0, 0)
    on conflict do nothing;
    v_current_local := 0;
    v_current_usd := 0;
  end if;

  if v_currency = 'USD' then
    v_usd_amount := p_amount;
  else
    v_usd_amount := round((p_amount / p_usd_rate)::numeric, 2);
  end if;

  if p_operation = 'CREDIT' then
    v_new_local := v_current_local + p_amount;
    v_new_usd := v_current_usd + v_usd_amount;
  else
    if v_current_local < p_amount then
      return jsonb_build_object(
        'success', false,
        'error', format('Insufficient %s balance: %.2f < %.2f', v_currency, v_current_local, p_amount),
        'current_balance_local', v_current_local,
        'current_balance_usd', v_current_usd
      );
    end if;
    v_new_local := v_current_local - p_amount;
    v_new_usd := v_current_usd - v_usd_amount;
  end if;

  update public.balances
  set
    amount = v_new_local,
    usd_equivalent = v_new_usd,
    updated_at = now(),
    version = version + 1
  where user_id = p_user_id
    and wallet_type = p_wallet_type
    and currency = v_currency;

  insert into public.ledger (
    transaction_id,
    user_id,
    wallet_type,
    operation,
    currency,
    amount,
    balance_before,
    balance_after,
    original_amount,
    original_currency,
    usd_converted_amount,
    usd_conversion_rate,
    balance_before_local,
    balance_after_local,
    balance_before_usd,
    balance_after_usd,
    reference_id,
    reason,
    initiated_by
  ) values (
    p_transaction_id,
    p_user_id,
    p_wallet_type,
    p_operation,
    v_currency,
    p_amount,
    v_current_local,
    v_new_local,
    p_amount,
    v_currency,
    v_usd_amount,
    p_usd_rate,
    v_current_local,
    v_new_local,
    v_current_usd,
    v_new_usd,
    p_reference_id,
    p_reason,
    p_initiated_by
  );

  return jsonb_build_object(
    'success', true,
    'old_balance_local', v_current_local,
    'new_balance_local', v_new_local,
    'old_balance_usd', v_current_usd,
    'new_balance_usd', v_new_usd,
    'transaction_id', p_transaction_id,
    'usd_amount', v_usd_amount,
    'rate_used', p_usd_rate
  );
end;
$$;

revoke all on function public.atomic_currency_balance_update(uuid, text, text, text, numeric, numeric, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.atomic_currency_balance_update(uuid, text, text, text, numeric, numeric, uuid, text, text, uuid) to service_role;

