import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { hasMinimumSecurity } from "@/lib/nexus-security-minimum"
import { getLaunchStarterFixPersonaId, getPlatformLaunchStatus, launchPromotionsActive } from "@/lib/server/platform-launch"
import { getSecurityProfileSetupFields } from "@/lib/server/user-security-profile-service"

/** Internal ops window — not communicated to customers. */
export const STARTUP_BONUS_CAMPAIGN_MONTHS = 2

export type StartupBonusOnboardingStatus = {
  hasStartupBonus: boolean
  startupBonusReceivedAt: string | null
  startupCapitalLockedUsd: number
  recommendedCommitUsd: number
  hasFixedTrade: boolean
  needsSecuritySetup: boolean
  starterFixUnlock: boolean
  starterFixPersonaId: string
  showCampaignPromo: boolean
}

function campaignEndsAtFromReceived(receivedAt: string): string {
  const ms = new Date(receivedAt).getTime()
  const end = new Date(ms)
  end.setMonth(end.getMonth() + STARTUP_BONUS_CAMPAIGN_MONTHS)
  return end.toISOString()
}

export function computeStartupBonusCampaignEndsAt(receivedAt: string): string {
  return campaignEndsAtFromReceived(receivedAt)
}

/** Internal: whether per-user campaign window is still open (ops only). */
export function isWithinStartupBonusCampaignWindow(
  receivedAt: string | null | undefined,
  endsAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!receivedAt) return false
  const endMs = endsAt ? new Date(endsAt).getTime() : new Date(campaignEndsAtFromReceived(receivedAt)).getTime()
  if (!Number.isFinite(endMs)) return false
  return nowMs < endMs
}

export async function buildStartupBonusOnboardingStatus(
  admin: SupabaseClient,
  userId: string,
): Promise<StartupBonusOnboardingStatus> {
  const [profileRes, fixedRes, launch, securityFields] = await Promise.all([
    admin
      .from("profiles")
      .select("startup_bonus_received_at,startup_capital_locked_usd,startup_bonus_campaign_ends_at")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("fixed_trade_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    getPlatformLaunchStatus(),
    getSecurityProfileSetupFields(admin, userId),
  ])

  const profile = profileRes.data
  const receivedAt =
    typeof profile?.startup_bonus_received_at === "string" ? profile.startup_bonus_received_at : null
  const lockedUsd = roundUsd2(Number(profile?.startup_capital_locked_usd ?? 0))
  const hasStartupBonus = Boolean(receivedAt && lockedUsd > 0)
  const fixedCount = fixedRes.count ?? 0
  const hasFixedTrade = fixedCount > 0

  const needsSecuritySetup = !hasMinimumSecurity(securityFields)
  const starterFixUnlock = Boolean(
    launchPromotionsActive(launch) && launch.programs.onboarding?.starter_fix_unlock,
  )
  const starterFixPersonaId = getLaunchStarterFixPersonaId(launch.programs)

  const welcome = launch.programs.new_member_welcome
  const showCampaignPromo =
    hasStartupBonus &&
    isWithinStartupBonusCampaignWindow(
      receivedAt,
      typeof profile?.startup_bonus_campaign_ends_at === "string"
        ? profile.startup_bonus_campaign_ends_at
        : null,
    ) &&
    welcome?.enabled !== false

  return {
    hasStartupBonus,
    startupBonusReceivedAt: receivedAt,
    startupCapitalLockedUsd: lockedUsd,
    recommendedCommitUsd: lockedUsd,
    hasFixedTrade,
    needsSecuritySetup,
    starterFixUnlock,
    starterFixPersonaId,
    showCampaignPromo,
  }
}
