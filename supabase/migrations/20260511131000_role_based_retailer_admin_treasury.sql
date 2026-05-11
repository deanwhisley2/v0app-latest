-- ============================================
-- ROLE-BASED ACCESS CONTROL + RETAILER OPS
-- ============================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- User role registry (public.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'USER' check (role in ('USER', 'RETAILER', 'ADMIN')),
  level integer not null default 1 check (level in (1, 2, 5)),
  region text,
  verified boolean not null default false,
  retailer_code text unique,
  activated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users add column if not exists role text not null default 'USER' check (role in ('USER', 'RETAILER', 'ADMIN'));
alter table public.users add column if not exists level integer not null default 1 check (level in (1, 2, 5));
alter table public.users add column if not exists region text;
alter table public.users add column if not exists verified boolean not null default false;
alter table public.users add column if not exists retailer_code text unique;
alter table public.users add column if not exists activated_by uuid references auth.users(id);
alter table public.users add column if not exists updated_at timestamptz not null default now();

comment on table public.users is 'Role registry aligned with auth.users for USER/RETAILER/ADMIN and operational activation.';

-- Keep role table warm for existing auth users.
insert into public.users (id)
select au.id
from auth.users au
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Retailer applications
-- ---------------------------------------------------------------------------
create table if not exists public.retailer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  region text not null,
  phone text not null,
  payment_method text,
  whatsapp_contact text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.retailer_applications is 'Retailer onboarding requests requiring Level-5 admin review.';

-- ---------------------------------------------------------------------------
-- Single-row admin treasury pool
-- ---------------------------------------------------------------------------
create table if not exists public.admin_treasury_pool (
  id integer primary key default 1 check (id = 1),
  balance_usd numeric(20,2) not null default 0 check (balance_usd >= 0),
  updated_at timestamptz not null default now(),
  constraint single_admin_treasury check (id = 1)
);

insert into public.admin_treasury_pool (id, balance_usd)
select 1, 0
where not exists (select 1 from public.admin_treasury_pool);

comment on table public.admin_treasury_pool is 'Single source of truth for Level-5 admin treasury balance.';

-- ---------------------------------------------------------------------------
-- Immutable retailer transactions
-- ---------------------------------------------------------------------------
create table if not exists public.retailer_transactions (
  id bigserial primary key,
  retailer_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('DEPOSIT', 'APPROVAL', 'WITHDRAWAL', 'LIQUIDITY_ALLOCATION')),
  amount_local numeric(20,2) not null,
  currency text not null,
  usd_amount numeric(20,2) not null,
  reference_id text not null,
  customer_id uuid references auth.users(id),
  status text not null default 'COMPLETED',
  created_at timestamptz not null default now()
);

create index if not exists idx_retailer_transactions_retailer_created
  on public.retailer_transactions (retailer_id, created_at desc);

comment on table public.retailer_transactions is 'Immutable audit trail for retailer money movement and approvals.';

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.retailer_applications enable row level security;
alter table public.retailer_transactions enable row level security;
alter table public.admin_treasury_pool enable row level security;

drop policy if exists "users_select_self" on public.users;
create policy "users_select_self"
  on public.users
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "retailer_applications_select_own" on public.retailer_applications;
create policy "retailer_applications_select_own"
  on public.retailer_applications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "retailer_applications_insert_own" on public.retailer_applications;
create policy "retailer_applications_insert_own"
  on public.retailer_applications
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "retailer_transactions_select_own" on public.retailer_transactions;
create policy "retailer_transactions_select_own"
  on public.retailer_transactions
  for select
  to authenticated
  using (retailer_id = auth.uid());

-- Keep admin_treasury_pool private to service_role / privileged server paths.
revoke all on table public.admin_treasury_pool from anon, authenticated;
grant all on table public.admin_treasury_pool to service_role;
