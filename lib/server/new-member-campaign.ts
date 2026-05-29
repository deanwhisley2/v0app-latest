import type { SupabaseClient } from "@supabase/supabase-js"
import {
  STARTUP_CAPITAL_USD_REWARD,
  type LaunchProgramsConfig,
} from "@/lib/platform-launch-config"
import { getPlatformLaunchStatus } from "@/lib/server/platform-launch"
import { grantStartupCapitalOnRegistration } from "@/lib/server/platform-incentives"

export type NewMemberWelcomeGrantSource = "registration" | "first_login"

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

export function newMemberWelcomeBonusUsd(programs?: LaunchProgramsConfig): number {
  const v = programs?.new_member_welcome?.usd_reward
  return typeof v === "number" && v > 0 ? v : STARTUP_CAPITAL_USD_REWARD
}

/**
 * Idempotent welcome bonus to Nexus Main (startup_capital_granted_at guard).
 * Safe to call on registration and again on first authenticated bootstrap.
 */
export async function grantNewMemberWelcomeBonus(
  admin: SupabaseClient,
  userId: string,
  _source: NewMemberWelcomeGrantSource,
): Promise<boolean> {
  if (!(await isNewMemberCampaignActive())) return false
  await grantStartupCapitalOnRegistration(admin, userId)
  const { data, error } = await admin
    .from("profiles")
    .select("startup_capital_granted_at")
    .eq("id", userId)
    .maybeSingle()
  if (error) return false
  return Boolean(data?.startup_capital_granted_at)
}
