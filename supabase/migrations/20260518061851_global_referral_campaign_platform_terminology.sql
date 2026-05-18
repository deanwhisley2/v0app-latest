BEGIN;

-- Desk persona labels: Income → Session (customer-facing display_name).
UPDATE public.container_trader_personas
SET display_name = replace(display_name, 'Income', 'Session')
WHERE display_name LIKE '%Income%';

-- Global 14-day referral campaign (all countries). Uganda window superseded when global is active.
INSERT INTO public.platform_launch_windows (
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
SELECT
  'global-referral-2026',
  'Global referral rewards event',
  'GLOBAL',
  14,
  true,
  coalesce(u.activated_at, now()),
  coalesce(u.ends_at, now() + interval '14 days'),
  'active',
  jsonb_build_object(
    'referrals', jsonb_build_object(
      'enabled', true,
      'referrer_flat_usd', 0.53,
      'referee_first_deposit_rate', 0.20,
      'notify_on_registration', true
    ),
    'onboarding', jsonb_build_object(
      'enabled', true,
      'welcome_notification', true,
      'launch_banner', true,
      'starter_fix_unlock', true,
      'starter_fix_persona_id', 'fix_l1_t1',
      'valid_referee_min_funded_usd', 3
    ),
    'monitoring', jsonb_build_object(
      'elevated_ops', true
    )
  )
FROM (SELECT 1) _one
LEFT JOIN public.platform_launch_windows u ON u.slug = 'uganda-launch-2026'
ON CONFLICT (slug) DO UPDATE SET
  title = excluded.title,
  region_code = excluded.region_code,
  duration_days = excluded.duration_days,
  programs = excluded.programs,
  updated_at = now(),
  activated_at = coalesce(public.platform_launch_windows.activated_at, excluded.activated_at),
  ends_at = coalesce(public.platform_launch_windows.ends_at, excluded.ends_at),
  status = case
    when public.platform_launch_windows.status = 'expired' then 'expired'
    when coalesce(public.platform_launch_windows.ends_at, excluded.ends_at) <= now() then 'expired'
    else 'active'
  end;

UPDATE public.platform_launch_windows
SET status = 'expired', updated_at = now()
WHERE slug = 'uganda-launch-2026';

COMMIT;
