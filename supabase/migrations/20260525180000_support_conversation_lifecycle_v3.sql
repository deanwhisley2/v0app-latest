-- Support conversation lifecycle v3: canonical statuses, system messages, push subscriptions.

-- Migrate legacy statuses to institutional lifecycle names.
update public.operational_support_threads
set status = 'pending_user'
where status in ('awaiting_response', 'answered');

update public.operational_support_threads
set status = 'under_review'
where status = 'processing';

alter table public.operational_support_threads
  drop constraint if exists operational_support_threads_status_check;

alter table public.operational_support_threads
  add constraint operational_support_threads_status_check
  check (
    status in (
      'open',
      'pending_user',
      'pending_admin',
      'under_review',
      'resolved',
      'closed'
    )
  );

alter table public.operational_support_messages
  add column if not exists is_system boolean not null default false,
  add column if not exists delivery_state text not null default 'delivered';

alter table public.operational_support_messages
  drop constraint if exists operational_support_messages_delivery_state_check;

alter table public.operational_support_messages
  add constraint operational_support_messages_delivery_state_check
  check (delivery_state in ('pending', 'delivered', 'failed'));

comment on column public.operational_support_messages.is_system is
  'True for automated lifecycle messages (status changes, closures).';

create table if not exists public.nexus_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  audience text not null default 'customer',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.nexus_push_subscriptions
  drop constraint if exists nexus_push_subscriptions_audience_check;

alter table public.nexus_push_subscriptions
  add constraint nexus_push_subscriptions_audience_check
  check (audience in ('customer', 'retailer', 'admin'));

alter table public.nexus_push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.nexus_push_subscriptions;
create policy "push_subscriptions_own"
  on public.nexus_push_subscriptions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.nexus_push_subscriptions to authenticated;
grant all on table public.nexus_push_subscriptions to service_role;

create index if not exists nexus_push_subscriptions_user_idx
  on public.nexus_push_subscriptions (user_id);
