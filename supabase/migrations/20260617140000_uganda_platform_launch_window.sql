-- Uganda launch window: centralized 14-day operational programs (service_role writes only).

create table if not exists public.platform_launch_windows (
  slug text primary key,
  title text not null,
  region_code text not null default 'UG',
  duration_days integer not null default 14 check (duration_days > 0 and duration_days <= 90),
  auto_activate boolean not null default true,
  activated_at timestamptz,
  ends_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'expired', 'paused')),
  programs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_launch_windows is
  'Institutional launch windows — referral/onboarding programs; server evaluates active window by activated_at/ends_at.';

create index if not exists platform_launch_windows_status_idx
  on public.platform_launch_windows (status, ends_at desc);

alter table public.platform_launch_windows enable row level security;

revoke all on table public.platform_launch_windows from anon;
grant select on table public.platform_launch_windows to authenticated;
grant all on table public.platform_launch_windows to service_role;

drop policy if exists "platform_launch_windows_select_authenticated" on public.platform_launch_windows;
create policy "platform_launch_windows_select_authenticated"
  on public.platform_launch_windows
  for select
  to authenticated
  using (true);

-- Seed Uganda launch (idempotent). activated_at set on first apply; ends_at = activated_at + 14 days.
insert into public.platform_launch_windows (
  slug,
  title,
  region_code,
  duration_days,
  auto_activate,
  activated_at,
  ends_at,
  status,
  programs
)
values (
  'uganda-launch-2026',
  'Uganda Launch Window',
  'UG',
  14,
  true,
  now(),
  now() + interval '14 days',
  'active',
  jsonb_build_object(
    'referrals', jsonb_build_object(
      'enabled', true,
      'first_deposit_rate', 0.05,
      'notify_on_registration', true
    ),
    'onboarding', jsonb_build_object(
      'enabled', true,
      'welcome_notification', true,
      'launch_banner', true,
      'default_country', 'UG',
      'starter_fix_unlock', true
    ),
    'monitoring', jsonb_build_object(
      'elevated_ops', true
    )
  )
)
on conflict (slug) do update set
  title = excluded.title,
  region_code = excluded.region_code,
  duration_days = excluded.duration_days,
  programs = excluded.programs,
  updated_at = now(),
  activated_at = coalesce(public.platform_launch_windows.activated_at, excluded.activated_at),
  ends_at = coalesce(
    public.platform_launch_windows.ends_at,
    coalesce(public.platform_launch_windows.activated_at, excluded.activated_at) + (excluded.duration_days || ' days')::interval
  ),
  status = case
    when public.platform_launch_windows.status = 'expired' then 'expired'
    when coalesce(public.platform_launch_windows.ends_at, excluded.ends_at) <= now() then 'expired'
    else coalesce(public.platform_launch_windows.status, 'active')
  end;
