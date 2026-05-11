-- ============================================
-- FINANCIAL SECURITY SYSTEM (additive, server-only)
-- Single-writer RPC + immutable ledger
--
-- Notes:
-- - These objects are additive and do not replace existing `user_balances` flows yet.
-- - Access is restricted to `service_role` by default (no client-side grants).
-- ============================================

-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

-- 1) BALANCES TABLE (single source of truth for this subsystem)
create table if not exists public.balances (
  user_id uuid not null,
  wallet_type text not null check (wallet_type in ('TREASURY', 'RETAIL', 'NEXUS_MAIN', 'EARNINGS')),
  currency text not null default 'UGX',
  amount numeric(20,2) not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  primary key (user_id, wallet_type, currency)
);

-- 2) LEDGER TABLE (append-only audit trail)
create table if not exists public.ledger (
  id bigserial primary key,
  transaction_id uuid not null,
  user_id uuid not null,
  wallet_type text not null,
  operation text not null check (operation in ('CREDIT', 'DEBIT')),
  currency text not null default 'UGX',
  amount numeric(20,2) not null check (amount > 0),
  balance_before numeric(20,2) not null,
  balance_after numeric(20,2) not null,
  reference_id text not null,
  reason text not null,
  initiated_by uuid not null,
  status text not null default 'COMPLETED',
  created_at timestamptz not null default now()
);

-- 3) PENDING FUNDING REQUESTS (requires confirmation)
create table if not exists public.pending_funding_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('USER_FUNDING', 'RETAILER_FLOAT')),
  requester_id uuid not null,
  currency text not null default 'UGX',
  amount numeric(20,2) not null check (amount > 0),
  payment_proof text,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'REJECTED', 'COMPLETED')),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4) ATOMIC BALANCE UPDATE FUNCTION (single-writer)
--
-- Security posture:
-- - SECURITY DEFINER to ensure the debit/credit+ledger happens in one atomic unit
-- - REVOKE execute from anon/authenticated; GRANT only to service_role
create or replace function public.atomic_balance_update(
  p_user_id uuid,
  p_wallet_type text,
  p_operation text,
  p_amount numeric(20,2),
  p_currency text,
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
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Amount must be > 0');
  end if;

  if p_wallet_type not in ('TREASURY', 'RETAIL', 'NEXUS_MAIN', 'EARNINGS') then
    return jsonb_build_object('success', false, 'error', 'Invalid wallet_type');
  end if;

  if p_operation not in ('CREDIT', 'DEBIT') then
    return jsonb_build_object('success', false, 'error', 'Invalid operation');
  end if;

  -- Lock row for update; create row if missing (0)
  select amount
    into v_current_balance
  from public.balances
  where user_id = p_user_id
    and wallet_type = p_wallet_type
    and currency = coalesce(nullif(p_currency, ''), 'UGX')
  for update;

  if not found then
    insert into public.balances (user_id, wallet_type, currency, amount)
    values (p_user_id, p_wallet_type, coalesce(nullif(p_currency, ''), 'UGX'), 0)
    on conflict do nothing;

    v_current_balance := 0;
  end if;

  if p_operation = 'CREDIT' then
    v_new_balance := v_current_balance + p_amount;
  else
    if v_current_balance < p_amount then
      return jsonb_build_object(
        'success', false,
        'error', format('Insufficient balance: %.2f < %.2f', v_current_balance, p_amount),
        'current_balance', v_current_balance
      );
    end if;
    v_new_balance := v_current_balance - p_amount;
  end if;

  update public.balances
  set amount = v_new_balance,
      updated_at = now(),
      version = version + 1
  where user_id = p_user_id
    and wallet_type = p_wallet_type
    and currency = coalesce(nullif(p_currency, ''), 'UGX');

  insert into public.ledger (
    transaction_id,
    user_id,
    wallet_type,
    operation,
    currency,
    amount,
    balance_before,
    balance_after,
    reference_id,
    reason,
    initiated_by
  ) values (
    p_transaction_id,
    p_user_id,
    p_wallet_type,
    p_operation,
    coalesce(nullif(p_currency, ''), 'UGX'),
    p_amount,
    v_current_balance,
    v_new_balance,
    p_reference_id,
    p_reason,
    p_initiated_by
  );

  return jsonb_build_object(
    'success', true,
    'old_balance', v_current_balance,
    'new_balance', v_new_balance,
    'transaction_id', p_transaction_id
  );
end;
$$;

-- 5) Indexes (performance)
create index if not exists idx_balances_user on public.balances(user_id);
create index if not exists idx_ledger_user on public.ledger(user_id);
create index if not exists idx_ledger_transaction on public.ledger(transaction_id);
create index if not exists idx_pending_status on public.pending_funding_requests(status);

-- 6) RLS + grants (server-only by default)
alter table public.balances enable row level security;
alter table public.ledger enable row level security;
alter table public.pending_funding_requests enable row level security;

revoke all on table public.balances from anon, authenticated;
revoke all on table public.ledger from anon, authenticated;
revoke all on table public.pending_funding_requests from anon, authenticated;
revoke all on function public.atomic_balance_update(uuid, text, text, numeric, text, uuid, text, text, uuid) from anon, authenticated;

grant all on table public.balances to service_role;
grant all on table public.ledger to service_role;
grant all on table public.pending_funding_requests to service_role;
grant execute on function public.atomic_balance_update(uuid, text, text, numeric, text, uuid, text, text, uuid) to service_role;

