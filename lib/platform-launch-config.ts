/**
 * Canonical launch program shape (stored in platform_launch_windows.programs JSONB).
 * UI copy keys only — financial decisions use numeric fields here, not i18n.
 */

export type LaunchReferralPrograms = {
  enabled: boolean
  first_deposit_rate?: number
  notify_on_registration?: boolean
}

export type LaunchOnboardingPrograms = {
  enabled: boolean
  welcome_notification?: boolean
  launch_banner?: boolean
  default_country?: string
  /** Relaxed band-1 starter persona during launch (display/unlock hints only; ledger unchanged). */
  starter_fix_unlock?: boolean
  valid_referee_min_funded_usd?: number
}

export type LaunchMonitoringPrograms = {
  elevated_ops?: boolean
}

export type LaunchProgramsConfig = {
  referrals?: LaunchReferralPrograms
  onboarding?: LaunchOnboardingPrograms
  monitoring?: LaunchMonitoringPrograms
}

export const UGANDA_LAUNCH_SLUG = "uganda-launch-2026"

export type PlatformLaunchPublicStatus = {
  active: boolean
  slug: string | null
  title: string | null
  regionCode: string | null
  activatedAt: string | null
  endsAt: string | null
  daysRemaining: number
  hoursRemaining: number
  programs: LaunchProgramsConfig
  launchMode: boolean
}

export const DEFAULT_UGANDA_LAUNCH_PROGRAMS: LaunchProgramsConfig = {
  referrals: {
    enabled: true,
    first_deposit_rate: 0.05,
    notify_on_registration: true,
  },
  onboarding: {
    enabled: true,
    welcome_notification: true,
    launch_banner: true,
    default_country: "UG",
    starter_fix_unlock: true,
    valid_referee_min_funded_usd: 3,
  },
  monitoring: {
    elevated_ops: true,
  },
}
