-- Extend global launch window and enable automatic new-member welcome bonus campaign.
-- Stop manually via NEXUS_NEW_MEMBER_CAMPAIGN=0 or programs.new_member_welcome.enabled=false.

BEGIN;

UPDATE public.platform_launch_windows
SET
  title = 'Nexus Pro member rewards — ongoing',
  ends_at = '2099-12-31T23:59:59.999Z'::timestamptz,
  status = 'active',
  programs = coalesce(programs, '{}'::jsonb)
    || jsonb_build_object(
      'new_member_welcome',
      jsonb_build_object(
        'enabled', true,
        'usd_reward', 5.3,
        'promo_banner', true,
        'promo_modal', true
      ),
      'startup_capital',
      coalesce(programs->'startup_capital', '{}'::jsonb)
        || jsonb_build_object(
          'enabled', true,
          'usd_reward', 5.3,
          'registrations_required', 10,
          'promo_modal', true
        ),
      'onboarding',
      coalesce(programs->'onboarding', '{}'::jsonb)
        || jsonb_build_object(
          'enabled', true,
          'welcome_notification', true,
          'launch_banner', true
        )
    ),
  updated_at = now()
WHERE slug = 'global-referral-2026';

COMMIT;
