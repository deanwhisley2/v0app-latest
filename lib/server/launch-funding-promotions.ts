import type { SupabaseClient } from "@supabase/supabase-js"
import { treasury } from "@/lib/financial/treasury-authority"
import {
  LAUNCH_REFEREE_FIRST_DEPOSIT_RATE,
  LAUNCH_REFERRER_FLAT_USD,
  type PlatformLaunchPublicStatus,
} from "@/lib/platform-launch-config"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { appendUserAccountNotification } from "@/lib/server/user-account-notifications"
import {
  getLaunchRefereeFirstDepositRate,
  getLaunchReferrerFlatUsd,
  getPlatformLaunchStatus,
  launchPromotionsActive,
} from "@/lib/server/platform-launch"
import { adminRetailPoolUserId } from "@/lib/server/admin-retail-pool"

/** Treasury RPC requires a UUID actor — use dedicated pool user or configured system id. */
function launchTreasuryActorId(): string {
  const pool = adminRetailPoolUserId()
  if (pool) return pool
  const env = process.env.NEXUS_TREASURY_SYSTEM_ACTOR_ID?.trim()
  if (env && env.length >= 30) return env
  return "00000000-0000-4000-8000-000000000001"
}

async function treasuryDebitReferenceExists(admin: SupabaseClient, referenceId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("unified_ledger")
    .select("transaction_id")
    .eq("reference_id", referenceId)
    .eq("operation", "DEBIT")
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data)
}

async function creditUserFromLaunchTreasury(
  sb: SupabaseClient,
  params: {
    userId: string
    amountUsd: number
    referenceId: string
    reason: string
    eventType: string
    summary: string
    metadata: Record<string, unknown>
    notificationTitle: string
    notificationBody: string
  },
): Promise<boolean> {
  const amt = roundUsd2(params.amountUsd)
  if (!(amt > 0)) return false

  if (await treasuryDebitReferenceExists(sb, params.referenceId)) {
    return true
  }

  const tr = await treasury.mutateTreasury(
    "DEBIT",
    amt,
    params.referenceId,
    params.reason,
    launchTreasuryActorId(),
    "MAIN_TREASURY",
  )
  if (!tr.success) {
    console.warn("[launch-funding-promotions] treasury debit failed:", tr.error, params.referenceId)
    return false
  }

  const now = new Date().toISOString()
  const { data: balRow, error: selErr } = await sb
    .from("user_balances")
    .select("available_balance")
    .eq("user_id", params.userId)
    .maybeSingle()
  if (selErr) {
    console.warn("[launch-funding-promotions] balance read:", selErr.message)
    return false
  }
  const cur = Number(balRow?.available_balance ?? 0)
  const { error: upErr } = await sb.from("user_balances").upsert(
    {
      user_id: params.userId,
      available_balance: roundUsd2(cur + amt),
      last_updated: now,
    },
    { onConflict: "user_id" },
  )
  if (upErr) {
    console.warn("[launch-funding-promotions] balance credit:", upErr.message)
    return false
  }

  await recordFinancialEvent({
    userId: params.userId,
    eventType: params.eventType,
    category: "funding",
    amount: amt,
    feeAmount: 0,
    balanceSource: "platform_treasury",
    balanceDestination: "available_balance",
    status: "completed",
    actorType: "system",
    summary: params.summary,
    metadata: params.metadata,
  })

  await appendUserAccountNotification(sb, {
    userId: params.userId,
    sourceKind: "launch_promotion",
    sourceId: params.referenceId,
    notificationType: params.eventType,
    title: params.notificationTitle,
    body: params.notificationBody,
    metadata: params.metadata,
  })

  return true
}

async function tryCreditRefereeLaunchDepositBonus(
  sb: SupabaseClient,
  refereeUserId: string,
  depositUsd: number,
  sourceRef: string,
  launch: PlatformLaunchPublicStatus,
): Promise<void> {
  const rate = getLaunchRefereeFirstDepositRate(launch.programs, LAUNCH_REFEREE_FIRST_DEPOSIT_RATE)
  const bonus = roundUsd2(depositUsd * rate)
  if (!(bonus > 0)) return

  const { data: referee, error: pErr } = await sb
    .from("profiles")
    .select("id,referee_launch_deposit_bonus_at")
    .eq("id", refereeUserId)
    .maybeSingle()
  if (pErr || !referee) return
  if (referee.referee_launch_deposit_bonus_at) return

  const refId = `launch_referee_deposit_bonus:${refereeUserId}`
  const ok = await creditUserFromLaunchTreasury(sb, {
    userId: refereeUserId,
    amountUsd: bonus,
    referenceId: refId,
    reason: `Launch first-deposit bonus ${(rate * 100).toFixed(0)}% (${sourceRef})`,
    eventType: "launch_referee_first_deposit_bonus",
    summary: `Launch promotion: ${(rate * 100).toFixed(0)}% first-deposit bonus credited to Nexus Main.`,
    metadata: { refereeUserId, depositUsd, rate, sourceRef, launchSlug: launch.slug },
    notificationTitle: "First deposit bonus credited",
    notificationBody: `Your launch promotion bonus of $${bonus.toFixed(2)} USD has been added to Nexus Main.`,
  })
  if (!ok) return

  const now = new Date().toISOString()
  const { error: upErr } = await sb
    .from("profiles")
    .update({ referee_launch_deposit_bonus_at: now, updated_at: now })
    .eq("id", refereeUserId)
  if (upErr) console.warn("[launch-funding-promotions] referee flag:", upErr.message)
}

async function tryCreditReferrerLaunchFlatBonus(
  sb: SupabaseClient,
  refereeUserId: string,
  depositUsd: number,
  sourceRef: string,
  launch: PlatformLaunchPublicStatus,
): Promise<void> {
  const flatUsd = getLaunchReferrerFlatUsd(launch.programs, LAUNCH_REFERRER_FLAT_USD)
  if (!(flatUsd > 0)) return

  const { data: referee, error: pErr } = await sb
    .from("profiles")
    .select("id,referred_by,referrer_first_deposit_bonus_at")
    .eq("id", refereeUserId)
    .maybeSingle()
  if (pErr || !referee) return

  const referrerId = referee.referred_by as string | null | undefined
  if (!referrerId || referrerId === refereeUserId) return
  if (referee.referrer_first_deposit_bonus_at) return

  const refId = `launch_referrer_flat:${refereeUserId}`
  const ok = await creditUserFromLaunchTreasury(sb, {
    userId: referrerId,
    amountUsd: flatUsd,
    referenceId: refId,
    reason: `Launch referral flat $${flatUsd} (referee ${refereeUserId}, ${sourceRef})`,
    eventType: "launch_referrer_flat_bonus",
    summary: `Launch promotion: $${flatUsd.toFixed(2)} referral reward for a qualifying first deposit.`,
    metadata: { refereeUserId, referrerId, depositUsd, flatUsd, sourceRef, launchSlug: launch.slug },
    notificationTitle: "Referral reward credited",
    notificationBody: `You earned $${flatUsd.toFixed(2)} USD from a referral's first deposit during the launch window.`,
  })
  if (!ok) return

  const now = new Date().toISOString()
  const { error: upErr } = await sb
    .from("profiles")
    .update({ referrer_first_deposit_bonus_at: now, updated_at: now })
    .eq("id", refereeUserId)
  if (upErr) console.warn("[launch-funding-promotions] referrer flag:", upErr.message)
}

/**
 * Apply launch-window promotions on a qualifying Nexus Main funding credit.
 * No-op when the 14-day launch window is not active.
 */
export async function applyLaunchFundingPromotions(
  sb: SupabaseClient,
  userId: string,
  depositUsd: number,
  sourceRef: string,
): Promise<void> {
  if (!(depositUsd > 0)) return
  try {
    const launch = await getPlatformLaunchStatus(true)
    if (!launchPromotionsActive(launch)) return
    await tryCreditRefereeLaunchDepositBonus(sb, userId, depositUsd, sourceRef, launch)
    await tryCreditReferrerLaunchFlatBonus(sb, userId, depositUsd, sourceRef, launch)
  } catch (e) {
    console.warn("[launch-funding-promotions]", e instanceof Error ? e.message : String(e))
  }
}

/** @deprecated Use applyLaunchFundingPromotions — kept for import sites. */
export async function tryCreditReferrerFirstDepositBonus(
  sb: SupabaseClient,
  refereeUserId: string,
  depositAmountUsd: number,
): Promise<void> {
  await applyLaunchFundingPromotions(sb, refereeUserId, depositAmountUsd, "legacy_retail_settlement")
}
