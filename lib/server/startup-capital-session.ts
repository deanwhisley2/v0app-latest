import type { SupabaseClient } from "@supabase/supabase-js"
import {
  STARTUP_CAPITAL_REGISTRATIONS_REQUIRED,
  STARTUP_CAPITAL_USD_REWARD,
  type PlatformLaunchPublicStatus,
} from "@/lib/platform-launch-config"
import { resolveCustomerExperience } from "@/lib/congo-customer-experience"
import { formatCustomerMoneyForUser } from "@/lib/server/customer-money-copy"
import { customerNotifyT } from "@/lib/server/customer-ui-language"
import {
  getPlatformLaunchStatus,
  getStartupCapitalRegistrationsRequired,
  getStartupCapitalUsdReward,
  startupCapitalActive,
} from "@/lib/server/platform-launch"
import { creditUserFromLaunchTreasury } from "@/lib/server/launch-funding-promotions"

export const STARTUP_CAPITAL_REFERENCE_PREFIX = "startup_capital_session"

export function isReferralMilestoneSlot(slot: number | null | undefined): boolean {
  return typeof slot === "number" && slot >= 1 && slot <= STARTUP_CAPITAL_REGISTRATIONS_REQUIRED
}

type MilestoneRpcResult = {
  slot: number | null
  count: number
  grant: boolean
}

function parseMilestoneRpc(raw: unknown): MilestoneRpcResult {
  if (!raw || typeof raw !== "object") {
    return { slot: null, count: 0, grant: false }
  }
  const o = raw as Record<string, unknown>
  const slot = typeof o.slot === "number" ? o.slot : null
  const count = typeof o.count === "number" ? o.count : 0
  const grant = o.grant === true
  return { slot, count, grant }
}

/**
 * Assign milestone slot (1–10) for anti-commission referrals; grant startup capital at 10.
 * Idempotent via RPC row lock + startup_capital_granted_at.
 */
export async function processReferralStartupMilestone(
  sb: SupabaseClient,
  referrerId: string,
  refereeId: string,
): Promise<MilestoneRpcResult> {
  try {
    const launch = await getPlatformLaunchStatus(true)
    if (!startupCapitalActive(launch)) {
      return { slot: null, count: 0, grant: false }
    }

    const { data, error } = await sb.rpc("process_referral_startup_milestone", {
      p_referrer_id: referrerId,
      p_referee_id: refereeId,
    })
    if (error) {
      console.warn("[startup-capital-session] milestone rpc:", error.message)
      return { slot: null, count: 0, grant: false }
    }

    const result = parseMilestoneRpc(data)
    if (result.grant) {
      await tryGrantStartupCapital(sb, referrerId, launch)
    }
    return result
  } catch (e) {
    console.warn("[startup-capital-session]", e instanceof Error ? e.message : String(e))
    return { slot: null, count: 0, grant: false }
  }
}

export async function tryGrantStartupCapital(
  sb: SupabaseClient,
  referrerId: string,
  launch?: PlatformLaunchPublicStatus,
): Promise<boolean> {
  const status = launch ?? (await getPlatformLaunchStatus(true))
  if (!startupCapitalActive(status)) return false

  const usd = getStartupCapitalUsdReward(status.programs, STARTUP_CAPITAL_USD_REWARD)
  const required = getStartupCapitalRegistrationsRequired(
    status.programs,
    STARTUP_CAPITAL_REGISTRATIONS_REQUIRED,
  )

  const { data: profile, error: pErr } = await sb
    .from("profiles")
    .select("id,startup_capital_granted_at")
    .eq("id", referrerId)
    .maybeSingle()
  if (pErr || !profile) return false
  if (profile.startup_capital_granted_at) return true

  const { count, error: cErr } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("referred_by", referrerId)
  if (cErr) {
    console.warn("[startup-capital-session] referral count:", cErr.message)
    return false
  }
  if ((count ?? 0) < required) return false

  const refId = `${STARTUP_CAPITAL_REFERENCE_PREFIX}:${referrerId}`
  const rewardFmt = await formatCustomerMoneyForUser(sb, referrerId, usd)
  const exp = await resolveCustomerExperience(sb, referrerId)
  const t = customerNotifyT(exp.language)

  const now = new Date().toISOString()
  const { data: locked, error: lockErr } = await sb
    .from("profiles")
    .update({ startup_capital_granted_at: now, updated_at: now })
    .eq("id", referrerId)
    .is("startup_capital_granted_at", null)
    .select("id")
    .maybeSingle()
  if (lockErr) {
    console.warn("[startup-capital-session] grant lock:", lockErr.message)
    return false
  }
  if (!locked) return true

  const ok = await creditUserFromLaunchTreasury(sb, {
    userId: referrerId,
    amountUsd: usd,
    referenceId: refId,
    reason: `Startup Capital Session ($${usd} USD equiv, ${required} referrals)`,
    eventType: "startup_capital_session",
    summary: `Startup Capital Session: ${required} referral registrations — ${usd.toFixed(2)} USD credited to Nexus Main.`,
    metadata: {
      referrerId,
      requiredRegistrations: required,
      usdReward: usd,
      launchSlug: status.slug,
    },
    notificationTitle: t("notifications.startupCapital.grantedTitle"),
    notificationBody: t("notifications.startupCapital.grantedBody").replace("{{amount}}", rewardFmt),
  })

  if (!ok) {
    await sb
      .from("profiles")
      .update({ startup_capital_granted_at: null, updated_at: new Date().toISOString() })
      .eq("id", referrerId)
      .eq("startup_capital_granted_at", now)
  }

  return ok
}

export async function loadStartupCapitalProgress(
  sb: SupabaseClient,
  userId: string,
): Promise<{
  active: boolean
  required: number
  registrationCount: number
  granted: boolean
  usdReward: number
}> {
  const launch = await getPlatformLaunchStatus()
  const active = startupCapitalActive(launch)
  const required = getStartupCapitalRegistrationsRequired(launch.programs)
  const usdReward = getStartupCapitalUsdReward(launch.programs)

  const { data: self, error: sErr } = await sb
    .from("profiles")
    .select("startup_capital_granted_at")
    .eq("id", userId)
    .maybeSingle()
  if (sErr) throw new Error(sErr.message)

  const { count, error: cErr } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("referred_by", userId)
  if (cErr) throw new Error(cErr.message)

  return {
    active,
    required,
    registrationCount: count ?? 0,
    granted: Boolean(self?.startup_capital_granted_at),
    usdReward,
  }
}
