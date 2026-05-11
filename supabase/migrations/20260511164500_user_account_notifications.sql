-- Durable user notifications + transaction mirror for transparency (soft-delete for user; admin retains full row).

create table if not exists public.user_account_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_kind text not null,
  source_id text not null,
  notification_type text not null default 'financial',
  title text not null,
  body text not null,
  nav jsonb,
  read_at timestamptz,
  user_deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists user_account_notifications_user_source_unique
  on public.user_account_notifications (user_id, source_kind, source_id);

comment on table public.user_account_notifications is
  'Account-level notifications and ledger-linked alerts. user_deleted_at hides from user UI only; service_role retains full audit.';

create index if not exists user_account_notifications_user_active_idx
  on public.user_account_notifications (user_id, created_at desc)
  where user_deleted_at is null;

-- Backfill recent ledger events (idempotent via unique index).
insert into public.user_account_notifications (
  user_id,
  source_kind,
  source_id,
  notification_type,
  title,
  body,
  nav,
  metadata
)
select
  e.user_id,
  'container_balance_event',
  e.id::text,
  'financial',
  'Account transaction',
  coalesce(
    nullif(trim(e.summary), ''),
    e.event_type || ' · gross $' || trim(to_char(e.gross_amount, 'FM999999990.00'))
  ),
  jsonb_build_object('kind', 'wallet'),
  jsonb_build_object(
    'event_type', e.event_type,
    'category', e.category,
    'status', e.status,
    'transaction_ref', e.transaction_ref
  )
from public.container_balance_events e
where e.created_at > (now() - interval '180 days')
  and coalesce(e.event_type, '') <> 'admin_retail_pool_debited'
on conflict (user_id, source_kind, source_id) do nothing;

alter table public.user_account_notifications enable row level security;

revoke all on table public.user_account_notifications from anon;
grant select, update on table public.user_account_notifications to authenticated;
grant all on table public.user_account_notifications to service_role;

drop policy if exists "user_account_notifications_select_own" on public.user_account_notifications;
create policy "user_account_notifications_select_own"
  on public.user_account_notifications
  for select
  to authenticated
  using (user_id = auth.uid() and user_deleted_at is null);

drop policy if exists "user_account_notifications_update_own" on public.user_account_notifications;
create policy "user_account_notifications_update_own"
  on public.user_account_notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
