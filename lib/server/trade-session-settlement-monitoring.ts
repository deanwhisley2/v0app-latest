import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { TRADE_SESSION_OPEN_STATUSES } from "@/lib/nexus-bot/user-session-messaging"
import {
  hasTradeSessionCancelEvent,
  hasTradeSessionFinancialResolution,
  hasTradeSessionOpenReservation,
} from "@/lib/server/nexus-bot-settlement-integrity"

export type TradeSessionSettlementMonitoring = {
  /** Open-status participants past ends_at with reserved capital not yet settled. */
  pastDueOpenParticipantCount: number
  pastDueOpenStakeUsd: number
  /** Terminal expired rows with open reservation and no complete/cancel ledger. */
  expiredUnsettledParticipantCount: number
  expiredUnsettledStakeUsd: number
  /** Cancelled rows with open reservation but no cancel/complete ledger. */
  cancelledUnsettledParticipantCount: number
  cancelledUnsettledStakeUsd: number
  /** Completed rows missing settlement ledger (credit repair target). */
  completedWithoutLedgerCount: number
  completedWithoutLedgerStakeUsd: number
  /** Sum of all stranded stake categories above. */
  totalStrandedStakeUsd: number
  /** Any category > 0 — should trigger alerts. */
  hasStrandedCapital: boolean
  checkedAt: string
}

type BotRow = {
  id: string
  user_id: string
  status: string
  stake_usd: number | string | null
  ends_at: string | null
  settled_at: string | null
}

/**
 * Ledger-aware settlement workflow monitoring for trade-session participants.
 * Used by admin stats, cron output, and /api/health/settlement.
 */
export async function computeTradeSessionSettlementMonitoring(
  admin: SupabaseClient,
  limit = 500,
): Promise<TradeSessionSettlementMonitoring> {
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from("nexus_bot_sessions")
    .select("id,user_id,status,stake_usd,ends_at,settled_at")
    .not("trade_session_id", "is", null)
    .gt("stake_usd", 0)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)

  let pastDueOpenParticipantCount = 0
  let pastDueOpenStakeUsd = 0
  let expiredUnsettledParticipantCount = 0
  let expiredUnsettledStakeUsd = 0
  let cancelledUnsettledParticipantCount = 0
  let cancelledUnsettledStakeUsd = 0
  let completedWithoutLedgerCount = 0
  let completedWithoutLedgerStakeUsd = 0

  for (const raw of data ?? []) {
    const row = raw as BotRow
    const stake = roundUsd2(Number(row.stake_usd ?? 0))
    if (!(stake > 0)) continue

    const uid = String(row.user_id)
    const botSessionId = String(row.id)
    const status = String(row.status)
    const endsAt = row.ends_at ? String(row.ends_at) : null
    const pastDue = Boolean(endsAt && endsAt < nowIso)

    const hasOpen = await hasTradeSessionOpenReservation(admin, uid, botSessionId)
    if (!hasOpen) continue

    const resolved = await hasTradeSessionFinancialResolution(admin, uid, botSessionId)
    const hasCancel = await hasTradeSessionCancelEvent(admin, uid, botSessionId)

    if (status === "completed" && !resolved) {
      completedWithoutLedgerCount += 1
      completedWithoutLedgerStakeUsd = roundUsd2(completedWithoutLedgerStakeUsd + stake)
      continue
    }

    if (status === "expired" && !resolved && !hasCancel) {
      expiredUnsettledParticipantCount += 1
      expiredUnsettledStakeUsd = roundUsd2(expiredUnsettledStakeUsd + stake)
      continue
    }

    if (status === "cancelled") {
      if (!hasCancel && !resolved) {
        cancelledUnsettledParticipantCount += 1
        cancelledUnsettledStakeUsd = roundUsd2(cancelledUnsettledStakeUsd + stake)
      }
      continue
    }

    if (
      pastDue &&
      (TRADE_SESSION_OPEN_STATUSES as readonly string[]).includes(status) &&
      !resolved
    ) {
      pastDueOpenParticipantCount += 1
      pastDueOpenStakeUsd = roundUsd2(pastDueOpenStakeUsd + stake)
    }
  }

  const totalStrandedStakeUsd = roundUsd2(
    pastDueOpenStakeUsd +
      expiredUnsettledStakeUsd +
      cancelledUnsettledStakeUsd +
      completedWithoutLedgerStakeUsd,
  )

  return {
    pastDueOpenParticipantCount,
    pastDueOpenStakeUsd,
    expiredUnsettledParticipantCount,
    expiredUnsettledStakeUsd,
    cancelledUnsettledParticipantCount,
    cancelledUnsettledStakeUsd,
    completedWithoutLedgerCount,
    completedWithoutLedgerStakeUsd,
    totalStrandedStakeUsd,
    hasStrandedCapital: totalStrandedStakeUsd > 0,
    checkedAt: nowIso,
  }
}
