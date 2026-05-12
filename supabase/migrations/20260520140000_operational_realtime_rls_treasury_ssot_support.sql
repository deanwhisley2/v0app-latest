-- Phase 1: Secure RLS + Realtime publication for operational tables
-- Phase 2: Treasury SSOT (treasury_balances MAIN_TREASURY) + unified_ledger balance columns
-- Phase 3: Persistent operational support threads + messages

-- -----------------------------------------------------------------------------
-- Helpers (profiles-based; never trust JWT user_metadata for authorization)
-- -----------------------------------------------------------------------------
create or replace function public.auth_is_level5()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select trading_user_level from public.profiles where id = auth.uid()),
    1
  ) = 5;
$$;

comment on function public.auth_is_level5() is
  'True when profiles.trading_user_level = 5 for auth.uid(). Used in RLS for liquidity admin reads (Realtime-safe).';

grant execute on function public.auth_is_level5() to authenticated;

-- -----------------------------------------------------------------------------
-- retailer_fund_requests — scoped SELECT for customers, desks, L5
-- -----------------------------------------------------------------------------
alter table public.retailer_fund_requests replica identity full;

grant select on table public.retailer_fund_requests to authenticated;

drop policy if exists "retailer_fund_requests_select_customer" on public.retailer_fund_requests;
create policy "retailer_fund_requests_select_customer"
  on public.retailer_fund_requests
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "retailer_fund_requests_select_desk" on public.retailer_fund_requests;
create policy "retailer_fund_requests_select_desk"
  on public.retailer_fund_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.retailer_profiles rp
      where rp.id = retailer_fund_requests.retailer_id
        and rp.user_id = auth.uid()
    )
  );

drop policy if exists "retailer_fund_requests_select_admin" on public.retailer_fund_requests;
create policy "retailer_fund_requests_select_admin"
  on public.retailer_fund_requests
  for select
  to authenticated
  using (public.auth_is_level5());

-- -----------------------------------------------------------------------------
-- withdrawal_requests — own rows + L5 oversight
-- -----------------------------------------------------------------------------
alter table public.withdrawal_requests replica identity full;

grant select on table public.withdrawal_requests to authenticated;

drop policy if exists "withdrawal_requests_select_own" on public.withdrawal_requests;
create policy "withdrawal_requests_select_own"
  on public.withdrawal_requests
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "withdrawal_requests_select_admin" on public.withdrawal_requests;
create policy "withdrawal_requests_select_admin"
  on public.withdrawal_requests
  for select
  to authenticated
  using (public.auth_is_level5());

-- -----------------------------------------------------------------------------
-- treasury_balances — L5 can subscribe to MAIN_TREASURY (USD SSOT row)
-- -----------------------------------------------------------------------------
grant select on table public.treasury_balances to authenticated;

drop policy if exists "treasury_balances_select_admin" on public.treasury_balances;
create policy "treasury_balances_select_admin"
  on public.treasury_balances
  for select
  to authenticated
  using (public.auth_is_level5());

-- -----------------------------------------------------------------------------
-- unified_ledger — treasury audit visibility for L5 (append-only)
-- -----------------------------------------------------------------------------
grant select on table public.unified_ledger to authenticated;

drop policy if exists "unified_ledger_select_admin" on public.unified_ledger;
create policy "unified_ledger_select_admin"
  on public.unified_ledger
  for select
  to authenticated
  using (public.auth_is_level5() and entity_type = 'TREASURY');

-- -----------------------------------------------------------------------------
-- container_balance_events — user sees own; L5 sees all (operational tracing)
-- -----------------------------------------------------------------------------
alter table public.container_balance_events replica identity full;

grant select on table public.container_balance_events to authenticated;

drop policy if exists "container_balance_events_select_own" on public.container_balance_events;
create policy "container_balance_events_select_own"
  on public.container_balance_events
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "container_balance_events_select_admin" on public.container_balance_events;
create policy "container_balance_events_select_admin"
  on public.container_balance_events
  for select
  to authenticated
  using (public.auth_is_level5());

-- user_account_notifications: existing RLS + grants; only add to Realtime publication below.

-- -----------------------------------------------------------------------------
-- retailer_applications — applicant sees own insert row; L5 sees pending (admin API still uses service_role)
-- -----------------------------------------------------------------------------
grant select on table public.retailer_applications to authenticated;

drop policy if exists "retailer_applications_select_own" on public.retailer_applications;
create policy "retailer_applications_select_own"
  on public.retailer_applications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "retailer_applications_select_admin" on public.retailer_applications;
create policy "retailer_applications_select_admin"
  on public.retailer_applications
  for select
  to authenticated
  using (public.auth_is_level5());

-- -----------------------------------------------------------------------------
-- Phase 2: unified_ledger treasury rows — balance before/after audit fields
-- -----------------------------------------------------------------------------
alter table public.unified_ledger
  add column if not exists balance_before_usd numeric(20,2),
  add column if not exists balance_after_usd numeric(20,2);

comment on column public.unified_ledger.balance_before_usd is 'Treasury pool USD before this line (TREASURY entity rows).';
comment on column public.unified_ledger.balance_after_usd is 'Treasury pool USD after this line (TREASURY entity rows).';

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
    operation, reference_id, reason, initiated_by,
    balance_before_usd, balance_after_usd
  ) values (
    p_transaction_id, 'TREASURY', 'treasury_pool', p_wallet_type,
    p_usd_amount, 'USD', p_usd_amount, 1,
    p_operation, p_reference_id, p_reason, p_initiated_by,
    v_current_balance, v_new_balance
  );

  return jsonb_build_object('success', true, 'new_balance', v_new_balance);
end;
$$;

-- -----------------------------------------------------------------------------
-- Phase 2b: retire duplicate admin_treasury_pool as SSOT (keep table; one-time merge)
-- -----------------------------------------------------------------------------
do $$
begin
  insert into public.treasury_balances (wallet_type, amount)
  values ('MAIN_TREASURY', 0)
  on conflict (wallet_type) do nothing;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_treasury_pool'
  ) then
    update public.treasury_balances tb
    set
      amount = greatest(
        tb.amount,
        coalesce((select balance_usd from public.admin_treasury_pool where id = 1 limit 1), 0)
      ),
      updated_at = now(),
      version = tb.version + 1
    where tb.wallet_type = 'MAIN_TREASURY';
  end if;
end $$;

comment on table public.admin_treasury_pool is
  'DEPRECATED for SSOT: authoritative USD treasury is public.treasury_balances (wallet_type = MAIN_TREASURY). Do not use for new mutations.';

-- -----------------------------------------------------------------------------
-- Phase 3: Operational support threads (persistent appeals / desk comms)
-- -----------------------------------------------------------------------------
create table if not exists public.operational_support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'general'
    check (category in ('general', 'funding_dispute', 'withdrawal_dispute', 'appeal', 'security', 'retailer')),
  status text not null default 'open'
    check (status in ('open', 'pending_admin', 'answered', 'resolved', 'closed')),
  linked_kind text null check (linked_kind is null or linked_kind in ('retailer_fund_request', 'withdrawal_request')),
  linked_id uuid null,
  assigned_admin_id uuid null references auth.users(id),
  escalated boolean not null default false,
  unread_for_admin boolean not null default true,
  unread_for_user boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operational_support_threads_user_idx
  on public.operational_support_threads (user_id, created_at desc);

comment on table public.operational_support_threads is
  'Persistent operational support / appeals; Realtime-enabled with strict RLS.';

create table if not exists public.operational_support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.operational_support_threads(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'admin', 'system')),
  body text not null,
  attachment_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operational_support_messages_thread_idx
  on public.operational_support_messages (thread_id, created_at asc);

alter table public.operational_support_threads replica identity full;
alter table public.operational_support_messages replica identity full;

alter table public.operational_support_threads enable row level security;
alter table public.operational_support_messages enable row level security;

grant select, insert, update on public.operational_support_threads to authenticated;
grant select, insert on public.operational_support_messages to authenticated;

drop policy if exists "support_threads_select_user" on public.operational_support_threads;
create policy "support_threads_select_user"
  on public.operational_support_threads
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "support_threads_select_admin" on public.operational_support_threads;
create policy "support_threads_select_admin"
  on public.operational_support_threads
  for select
  to authenticated
  using (public.auth_is_level5());

drop policy if exists "support_threads_insert_user" on public.operational_support_threads;
create policy "support_threads_insert_user"
  on public.operational_support_threads
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "support_threads_update_parties" on public.operational_support_threads;
create policy "support_threads_update_parties"
  on public.operational_support_threads
  for update
  to authenticated
  using (user_id = auth.uid() or public.auth_is_level5())
  with check (user_id = auth.uid() or public.auth_is_level5());

drop policy if exists "support_messages_select_thread" on public.operational_support_messages;
create policy "support_messages_select_thread"
  on public.operational_support_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.operational_support_threads t
      where t.id = operational_support_messages.thread_id
        and (t.user_id = auth.uid() or public.auth_is_level5())
    )
  );

drop policy if exists "support_messages_insert_parties" on public.operational_support_messages;
create policy "support_messages_insert_parties"
  on public.operational_support_messages
  for insert
  to authenticated
  with check (
    sender_user_id = auth.uid()
    and exists (
      select 1 from public.operational_support_threads t
      where t.id = operational_support_messages.thread_id
        and (
          (t.user_id = auth.uid() and sender_role in ('user', 'system'))
          or (public.auth_is_level5() and sender_role in ('admin', 'system'))
        )
    )
  );

grant all on table public.operational_support_threads to service_role;
grant all on table public.operational_support_messages to service_role;

-- -----------------------------------------------------------------------------
-- Realtime publication (idempotent adds)
-- -----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.retailer_fund_requests;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.withdrawal_requests;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.treasury_balances;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.container_balance_events;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.user_account_notifications;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.retailer_applications;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.operational_support_threads;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.operational_support_messages;
exception
  when duplicate_object then null;
end $$;
