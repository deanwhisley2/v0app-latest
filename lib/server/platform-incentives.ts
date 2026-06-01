import type { SupabaseClient } from "@supabase/supabase-js"
import type { LaunchProgramsConfig } from "@/lib/platform-launch-config"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { treasury } from "@/lib/financial/treasury-authority"
import { adminRetailPoolUserId } from "@/lib/server/admin-retail-pool"
import { appendUserAccountNotification } from "@/lib/server/user-account-notifications"
import { formatCustomerMoneyForUser } from "@/lib/server/customer-money-copy"
import { computeStartupBonusCampaignEndsAt } from "@/lib/server/startup-bonus-onboarding"

const FIRST_DEPOSIT_BONUS_RATE = 0.2
const REFERRAL_FIRST_TRADE_REWARD_USD = 0.26
const STARTUP_CAPITAL_USD = 5.3

function treasuryActorId(): string {
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

async function creditUserFromTreasury(
  admin: SupabaseClient,
  params: {
    userId: string
    amountUsd: number
    referenceId: string
    reason: string
    notificationType: string
    notificationTitle: string
    notificationBody: string
    sourceKind: string
  },
): Promise<boolean> {
  const amountUsd = roundUsd2(params.amountUsd)
  if (!(amountUsd > 0)) return false

  if (await treasuryDebitReferenceExists(admin, params.referenceId)) {
    return true
  }

  const tr = await treasury.mutateTreasury(
    "DEBIT",
    amountUsd,
    params.referenceId,
    params.reason,
    treasuryActorId(),
    "MAIN_TREASURY",
  )
  if (!tr.success) {
    console.warn("[platform-incentives] treasury debit failed:", params.referenceId, tr.error)
    return false
  }

  const now = new Date().toISOString()
  const { data: bal, error: balErr } = await admin
    .from("user_balances")
    .select("available_balance")
    .eq("user_id", params.userId)
    .maybeSingle()
  if (balErr) {
    console.warn("[platform-incentives] balance read failed:", params.userId, balErr.message)
    return false
  }

  const { error: upErr } = await admin.from("user_balances").upsert(
    {
      user_id: params.userId,
      available_balance: roundUsd2(Number(bal?.available_balance ?? 0) + amountUsd),
      last_updated: now,
    },
    { onConflict: "user_id" },
  )
  if (upErr) {
    console.warn("[platform-incentives] balance upsert failed:", params.userId, upErr.message)
    return false
  }

  await appendUserAccountNotification(admin, {
    userId: params.userId,
    sourceKind: params.sourceKind,
    sourceId: params.referenceId,
    notificationType: params.notificationType,
    title: params.notificationTitle,
    body: params.notificationBody,
    nav: { tab: "history" },
    metadata: { amount_usd: amountUsd },
  })
  return true
}

/** One-time 20% bonus on first successful deposit approval (referral-independent). */
export async function applyFirstDepositBonus(
  admin: SupabaseClient,
  userId: string,
  depositUsd: number,
  sourceRef: string,
): Promise<void> {
  if (!(depositUsd > 0)) return
  const { data: prof, error: pErr } = await admin
    .from("profiles")
    .select("id,first_deposit_bonus_applied_at")
    .eq("id", userId)
    .maybeSingle()
  if (pErr || !prof || prof.first_deposit_bonus_applied_at) return

  const bonusUsd = roundUsd2(depositUsd * FIRST_DEPOSIT_BONUS_RATE)
  if (!(bonusUsd > 0)) return
  const refId = `first_deposit_bonus:${userId}`
  const bonusFmt = await formatCustomerMoneyForUser(admin, userId, bonusUsd)

  const ok = await creditUserFromTreasury(admin, {
    userId,
    amountUsd: bonusUsd,
    referenceId: refId,
    reason: `First deposit bonus 20% (${sourceRef})`,
    notificationType: "first_deposit_bonus",
    notificationTitle: "First Deposit Bonus Applied",
    notificationBody: `First Deposit Bonus Applied (${bonusFmt}).`,
    sourceKind: "first_deposit_bonus",
  })
  if (!ok) return

  const now = new Date().toISOString()
  await admin
    .from("profiles")
    .update({ first_deposit_bonus_applied_at: now, updated_at: now })
    .eq("id", userId)
    .is("first_deposit_bonus_applied_at", null)
}

/**
 * One-time referral reward paid to referrer when referee opens the first trade.
 * Guards self-referrals and direct loops (A refers B, B refers A).
 */
export async function applyReferralRewardOnFirstTrade(
  admin: SupabaseClient,
  refereeUserId: string,
  sourceRef: string,
): Promise<void> {
  const { data: referee, error: refErr } = await admin
    .from("profiles")
    .select("id,referred_by,referral_first_trade_reward_at")
    .eq("id", refereeUserId)
    .maybeSingle()
  if (refErr || !referee) return
  const referrerId = (referee.referred_by as string | null) ?? null
  if (!referrerId || referrerId === refereeUserId) return
  if (referee.referral_first_trade_reward_at) return

  const { data: referrer } = await admin
    .from("profiles")
    .select("id,referred_by")
    .eq("id", referrerId)
    .maybeSingle()
  if (!referrer) return
  if ((referrer.referred_by as string | null) === refereeUserId) return

  const rewardFmt = await formatCustomerMoneyForUser(admin, referrerId, REFERRAL_FIRST_TRADE_REWARD_USD)
  const ok = await creditUserFromTreasury(admin, {
    userId: referrerId,
    amountUsd: REFERRAL_FIRST_TRADE_REWARD_USD,
    referenceId: `referral_first_trade_reward:${refereeUserId}`,
    reason: `Referral reward on referee first trade (${sourceRef})`,
    notificationType: "referral_first_trade_reward",
    notificationTitle: "Referral reward added successfully.",
    notificationBody: `Referral reward added successfully. (${rewardFmt})`,
    sourceKind: "referral_first_trade_reward",
  })
  if (!ok) return

  const now = new Date().toISOString()
  await admin
    .from("profiles")
    .update({ referral_first_trade_reward_at: now, updated_at: now })
    .eq("id", refereeUserId)
    .is("referral_first_trade_reward_at", null)
}

/** One-time new-member welcome bonus — Nexus Main credit + locked principal marker. */
export async function grantNewMemberWelcomeBonusToProfile(
  admin: SupabaseClient,
  userId: string,
  programs?: LaunchProgramsConfig,
): Promise<void> {
  const bonusUsd = roundUsd2(
    typeof programs?.new_member_welcome?.usd_reward === "number" &&
      programs.new_member_welcome.usd_reward > 0
      ? programs.new_member_welcome.usd_reward
      : STARTUP_CAPITAL_USD,
  )

  const { data: prof, error: pErr } = await admin
    .from("profiles")
    .select("id,startup_bonus_received_at,startup_capital_locked_usd")
    .eq("id", userId)
    .maybeSingle()
  if (pErr || !prof) return
  if (prof.startup_bonus_received_at) return

  const bonusFmt = await formatCustomerMoneyForUser(admin, userId, bonusUsd)
  const ok = await creditUserFromTreasury(admin, {
    userId,
    amountUsd: bonusUsd,
    referenceId: `startup_capital:${userId}`,
    reason: "New member welcome bonus (startup trading capital)",
    notificationType: "startup_trading_capital",
    notificationTitle: "New member welcome bonus credited",
    notificationBody: `${bonusFmt} is in your Nexus Main balance. Explore copy trading, fixed trades, and fast withdrawals.`,
    sourceKind: "startup_trading_capital",
  })
  if (!ok) return

  const now = new Date().toISOString()
  await admin
    .from("profiles")
    .update({
      startup_bonus_received_at: now,
      startup_capital_locked_usd: bonusUsd,
      startup_bonus_campaign_ends_at: computeStartupBonusCampaignEndsAt(now),
      updated_at: now,
    })
    .eq("id", userId)
    .is("startup_bonus_received_at", null)
}

