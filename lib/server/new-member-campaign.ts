import type { SupabaseClient } from "@supabase/supabase-js"
import {
  STARTUP_CAPITAL_USD_REWARD,
  type LaunchProgramsConfig,
} from "@/lib/platform-launch-config"
import { getPlatformLaunchStatus } from "@/lib/server/platform-launch"
import { grantNewMemberWelcomeBonusToProfile } from "@/lib/server/platform-incentives"

/** Deploy timestamp of campaign slice 5900e55 — registrations before this are ineligible. */
export const DEFAULT_NEW_MEMBER_WELCOME_ELIGIBLE_AFTER = "2026-05-29T00:42:00.000Z"

export type NewMemberWelcomeGrantSource = "registration"

/** Kill-switch: set NEXUS_NEW_MEMBER_CAMPAIGN=0 to stop grants without redeploying copy. */
export async function isNewMemberCampaignActive(): Promise<boolean> {
  const env = process.env.NEXUS_NEW_MEMBER_CAMPAIGN?.trim().toLowerCase()
  if (env === "0" || env === "false" || env === "off") return false
  if (env === "1" || env === "true" || env === "on") return true

  const launch = await getPlatformLaunchStatus()
  const welcome = launch.programs.new_member_welcome
  if (welcome?.enabled === false) return false
  if (welcome?.enabled === true) return true

  return launch.active
}

export function newMemberWelcomeEligibleAfter(programs?: LaunchProgramsConfig): string {
  const env = process.env.NEXUS_NEW_MEMBER_CAMPAIGN_START?.trim()
  if (env) return env
  const fromPrograms = programs?.new_member_welcome?.eligible_after
  if (typeof fromPrograms === "string" && fromPrograms.length > 0) return fromPrograms
  return DEFAULT_NEW_MEMBER_WELCOME_ELIGIBLE_AFTER
}

/** Postgres/JSON often uses `+00`; JS `Date` needs `Z` or `+00:00`. */
export function parseEligibleAfterMs(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) return NaN
  const candidates = [
    trimmed,
    trimmed.replace(/\+00$/, "Z"),
    trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T"),
  ]
  for (const c of candidates) {
    const ms = new Date(c).getTime()
    if (Number.isFinite(ms)) return ms
  }
  return NaN
}

export function newMemberWelcomeBonusUsd(programs?: LaunchProgramsConfig): number {
  const v = programs?.new_member_welcome?.usd_reward
  return typeof v === "number" && v > 0 ? v : STARTUP_CAPITAL_USD_REWARD
}

type ProfileEligibilityRow = {
  id: string
  created_at: string
  startup_bonus_received_at: string | null
}

/** True only for accounts created on/after campaign eligible_after with no prior bonus flag. */
export async function isProfileEligibleForNewMemberWelcome(
  admin: SupabaseClient,
  userId: string,
  programs?: LaunchProgramsConfig,
): Promise<boolean> {
  const { data, error } = await admin
    .from("profiles")
    .select("id,created_at,startup_bonus_received_at")
    .eq("id", userId)
    .maybeSingle()
  if (error || !data) return false
  return profileRowEligibleForNewMemberWelcome(data as ProfileEligibilityRow, programs)
}

export function profileRowEligibleForNewMemberWelcome(
  row: ProfileEligibilityRow,
  programs?: LaunchProgramsConfig,
): boolean {
  if (row.startup_bonus_received_at) return false
  const cutoffMs = parseEligibleAfterMs(newMemberWelcomeEligibleAfter(programs))
  if (!Number.isFinite(cutoffMs)) return false
  const createdMs = new Date(row.created_at).getTime()
  if (!Number.isFinite(createdMs)) return false
  return createdMs >= cutoffMs
}

/**
 * Idempotent welcome bonus — registration route only.
 * Guarded by startup_bonus_received_at + profile.created_at >= eligible_after.
 */
export async function grantNewMemberWelcomeBonus(
  admin: SupabaseClient,
  userId: string,
  _source: NewMemberWelcomeGrantSource,
): Promise<boolean> {
  if (!(await isNewMemberCampaignActive())) {
    console.warn("[new-member-campaign] inactive — skip grant:", userId)
    return false
  }

  const launch = await getPlatformLaunchStatus()
  if (!(await isProfileEligibleForNewMemberWelcome(admin, userId, launch.programs))) {
    console.warn("[new-member-campaign] ineligible profile — skip grant:", userId)
    return false
  }

  await grantNewMemberWelcomeBonusToProfile(admin, userId, launch.programs)

  const { data, error } = await admin
    .from("profiles")
    .select("startup_bonus_received_at")
    .eq("id", userId)
    .maybeSingle()
  if (error) return false
  return Boolean(data?.startup_bonus_received_at)
}
