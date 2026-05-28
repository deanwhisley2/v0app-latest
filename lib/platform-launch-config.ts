/**
 * Canonical launch program shape (stored in platform_launch_windows.programs JSONB).
 * UI copy keys only — financial decisions use numeric fields here, not i18n.
 */

export type LaunchReferralPrograms = {
  enabled: boolean
  /** @deprecated Launch window uses referrer_flat_usd instead of % of deposit. */
  first_deposit_rate?: number
  /** One-time flat USD paid to referrer when referee completes first qualifying deposit. */
  referrer_flat_usd?: number
  /** Fraction of referee first deposit credited to referee (e.g. 0.20 = 20%). */
  referee_first_deposit_rate?: number
  notify_on_registration?: boolean
}

export type LaunchOnboardingPrograms = {
  enabled: boolean
  welcome_notification?: boolean
  launch_banner?: boolean
  default_country?: string
  /** Unlock one starter fixed-trade desk during the launch window after funding. */
  starter_fix_unlock?: boolean
  /** container_trader_personas.id — default fix_l1_t1 */
  starter_fix_persona_id?: string
  valid_referee_min_funded_usd?: number
}

export type LaunchMonitoringPrograms = {
  elevated_ops?: boolean
}

/** Startup Capital Session — 10 referral registrations unlock ~$6 USD equiv once. */
export type LaunchStartupCapitalPrograms = {
  enabled: boolean
  /** USD treasury debit amount (converted for customer display only). */
  usd_reward?: number
  registrations_required?: number
  promo_modal?: boolean
}

export type LaunchProgramsConfig = {
  referrals?: LaunchReferralPrograms
  onboarding?: LaunchOnboardingPrograms
  monitoring?: LaunchMonitoringPrograms
  startup_capital?: LaunchStartupCapitalPrograms
}

export const UGANDA_LAUNCH_SLUG = "uganda-launch-2026"

/** Active promotional cycle — all countries, 14 days. */
export const GLOBAL_LAUNCH_SLUG = "global-referral-2026"

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

export const LAUNCH_REFERRER_FLAT_USD = 0.26
export const LAUNCH_REFEREE_FIRST_DEPOSIT_RATE = 0.2
export const LAUNCH_STARTER_FIX_PERSONA_ID = "fix_l1_t1"
export const STARTUP_CAPITAL_USD_REWARD = 5.3
export const STARTUP_CAPITAL_REGISTRATIONS_REQUIRED = 10

export const DEFAULT_GLOBAL_LAUNCH_PROGRAMS: LaunchProgramsConfig = {
  referrals: {
    enabled: true,
    referrer_flat_usd: LAUNCH_REFERRER_FLAT_USD,
    referee_first_deposit_rate: LAUNCH_REFEREE_FIRST_DEPOSIT_RATE,
    notify_on_registration: true,
  },
  onboarding: {
    enabled: true,
    welcome_notification: true,
    launch_banner: true,
    starter_fix_unlock: true,
    starter_fix_persona_id: LAUNCH_STARTER_FIX_PERSONA_ID,
    valid_referee_min_funded_usd: 3,
  },
  monitoring: {
    elevated_ops: true,
  },
  startup_capital: {
    enabled: true,
    usd_reward: STARTUP_CAPITAL_USD_REWARD,
    registrations_required: STARTUP_CAPITAL_REGISTRATIONS_REQUIRED,
    promo_modal: true,
  },
}

/** @deprecated Prefer DEFAULT_GLOBAL_LAUNCH_PROGRAMS — Uganda-only window retained for legacy rows. */
export const DEFAULT_UGANDA_LAUNCH_PROGRAMS: LaunchProgramsConfig = {
  ...DEFAULT_GLOBAL_LAUNCH_PROGRAMS,
  onboarding: {
    enabled: true,
    welcome_notification: true,
    launch_banner: true,
    starter_fix_unlock: true,
    starter_fix_persona_id: LAUNCH_STARTER_FIX_PERSONA_ID,
    valid_referee_min_funded_usd: 3,
    default_country: "UG",
  },
}
