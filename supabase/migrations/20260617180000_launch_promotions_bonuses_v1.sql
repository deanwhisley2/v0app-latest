-- Launch promotions: referee first-deposit bonus flag + program rates in launch window.

alter table public.profiles
  add column if not exists referee_launch_deposit_bonus_at timestamptz null;

comment on column public.profiles.referee_launch_deposit_bonus_at is
  'Set when the user received the one-time launch-window first-deposit bonus (e.g. 20%) on Nexus Main.';

update public.platform_launch_windows
set
  programs = programs
    || jsonb_build_object(
      'referrals',
      coalesce(programs->'referrals', '{}'::jsonb)
        || jsonb_build_object(
          'enabled', true,
          'referrer_flat_usd', 0.53,
          'referee_first_deposit_rate', 0.20,
          'notify_on_registration', true
        ),
      'onboarding',
      coalesce(programs->'onboarding', '{}'::jsonb)
        || jsonb_build_object(
          'enabled', true,
          'welcome_notification', true,
          'launch_banner', true,
          'default_country', 'UG',
          'starter_fix_unlock', true,
          'starter_fix_persona_id', 'fix_l1_t1'
        )
    ),
  updated_at = now()
where slug = 'uganda-launch-2026'
  and status in ('scheduled', 'active');
