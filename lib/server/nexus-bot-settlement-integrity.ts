import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { closedTradeHistorySummary } from "@/lib/nexus-bot/user-session-messaging"
import { creditPrincipalToMainAndEarningsToPocket } from "@/lib/server/copy-trade-balance-credit"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { TRADE_SESSION_RESERVE_SOURCE } from "@/lib/server/trade-session-earnings-reserve"

const EPSILON_USD = 0.005

export type SettlementCreditEnsureResult = {
  applied: boolean
  reason: "initial_credit" | "topup" | "already_settled" | "nothing_due"
}

export async function hasTradeSessionSettlementEvent(
  admin: SupabaseClient,
  userId: string,
  botSessionId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("container_balance_events")
    .select("id")
    .eq("user_id", userId)
    .eq("related_session_id", botSessionId)
    .in("event_type", ["nexus_trade_session_complete", "nexus_trade_session_reconcile_topup"])
    .limit(1)
  if (error) throw new Error(error.message)
  return Boolean(data && data.length > 0)
}

function recordedProfitFromCompleteEvent(metadata: Record<string, unknown> | null | undefined): number {
  if (!metadata) return 0
  const released = metadata.released_profit_usd ?? metadata.profit_usd ?? metadata.earnings_to_pocket_usd
  return roundUsd2(Number(released ?? 0))
}

/**
 * Idempotent: credits principal → Nexus Main and earnings → Pocket when ledger event is missing
 * or profit_released_usd exceeds what was recorded on the completion event.
 */
export async function ensureTradeSessionSettlementCredits(
  admin: SupabaseClient,
  params: {
    userId: string
    botSessionId: string
    stakeUsd: number
    profitUsd: number
    tradeSessionId?: string | null
    joinedAt?: string | null
    participationWeight?: number
    minFloorApplied?: boolean
    forceFullParticipation?: boolean
    summary?: string
    eventMetadata?: Record<string, unknown>
  },
): Promise<SettlementCreditEnsureResult> {
  const stake = roundUsd2(params.stakeUsd)
  const profit = roundUsd2(params.profitUsd)
  if (!(stake > 0) && !(profit > 0)) {
    return { applied: false, reason: "nothing_due" }
  }

  const { data: completeEv, error: evErr } = await admin
    .from("container_balance_events")
    .select("id, metadata")
    .eq("user_id", params.userId)
    .eq("related_session_id", params.botSessionId)
    .eq("event_type", "nexus_trade_session_complete")
    .maybeSingle()
  if (evErr) throw new Error(evErr.message)

  if (!completeEv) {
    if (stake > 0 || profit > 0) {
      await creditPrincipalToMainAndEarningsToPocket(admin, params.userId, stake, profit)
    }
    await recordFinancialEvent({
      userId: params.userId,
      eventType: "nexus_trade_session_complete",
      category: "container",
      amount: roundUsd2(stake + profit),
      balanceSource: "nexus_bot_session",
      balanceDestination:
        profit > 0 && stake > 0
          ? "available_balance,container_withdrawable_earnings"
          : profit > 0
            ? "container_withdrawable_earnings"
            : "available_balance",
      status: "completed",
      actorType: "system",
      actorId: params.userId,
      relatedSessionId: params.botSessionId,
      summary: params.summary ?? closedTradeHistorySummary(profit),
      metadata: {
        session_id: params.botSessionId,
        trade_session_id: params.tradeSessionId ?? null,
        joined_at: params.joinedAt ?? null,
        participation_weight: params.participationWeight ?? null,
        released_profit_usd: profit,
        profit_usd: profit,
        stake_returned_usd: stake,
        earnings_to_pocket_usd: profit,
        principal_to_main_usd: stake,
        reserve_source: TRADE_SESSION_RESERVE_SOURCE,
        earnings_source: TRADE_SESSION_RESERVE_SOURCE,
        min_floor_applied: Boolean(params.minFloorApplied),
        pocket_manual_transfer_required: profit > 0,
        ...(params.eventMetadata ?? {}),
        ...(params.forceFullParticipation ? { settlement_mode: "full_session_target" } : {}),
        ...(!params.eventMetadata ? { repair_applied: true } : {}),
      },
    })
    return { applied: true, reason: "initial_credit" }
  }

  const recordedProfit = recordedProfitFromCompleteEvent(
    completeEv.metadata as Record<string, unknown> | null | undefined,
  )
  const topUp = roundUsd2(profit - recordedProfit)
  if (!(topUp > EPSILON_USD)) {
    return { applied: false, reason: "already_settled" }
  }

  await creditPrincipalToMainAndEarningsToPocket(admin, params.userId, 0, topUp)
  await recordFinancialEvent({
    userId: params.userId,
    eventType: "nexus_trade_session_reconcile_topup",
    category: "container",
    amount: topUp,
    balanceSource: "nexus_bot_session_reconciliation",
    balanceDestination: "container_withdrawable_earnings",
    status: "completed",
    actorType: "system",
    actorId: params.userId,
    relatedSessionId: params.botSessionId,
    summary: `Reconciliation top-up — released earnings credited (${topUp.toFixed(2)} USD).`,
    metadata: {
      session_id: params.botSessionId,
      trade_session_id: params.tradeSessionId ?? null,
      previous_profit_usd: recordedProfit,
      reconciled_profit_usd: profit,
      repair_applied: true,
    },
  })
  return { applied: true, reason: "topup" }
}

/** Repair completed trade-session bot rows that never received balance credits. */
export async function repairUnsettledCompletedSessions(
  admin: SupabaseClient,
  userId?: string,
  limit = 80,
): Promise<number> {
  let q = admin
    .from("nexus_bot_sessions")
    .select("id,user_id,stake_usd,profit_released_usd,trade_session_id,queued_at,participation_weight,settled_at")
    .eq("status", "completed")
    .not("trade_session_id", "is", null)
    .order("settled_at", { ascending: false })
    .limit(limit)
  if (userId) q = q.eq("user_id", userId)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  let repaired = 0
  for (const row of data ?? []) {
    const botSessionId = String(row.id)
    const uid = String(row.user_id)
    const hasEvent = await hasTradeSessionSettlementEvent(admin, uid, botSessionId)
    const stake = roundUsd2(Number(row.stake_usd ?? 0))
    const profit = roundUsd2(Number(row.profit_released_usd ?? 0))
    if (hasEvent && profit <= 0 && stake <= 0) continue

    const result = await ensureTradeSessionSettlementCredits(admin, {
      userId: uid,
      botSessionId,
      stakeUsd: stake,
      profitUsd: profit,
      tradeSessionId: row.trade_session_id ? String(row.trade_session_id) : null,
      joinedAt: row.queued_at ? String(row.queued_at) : null,
      participationWeight: Number(row.participation_weight ?? 1),
    })
    if (result.applied) repaired += 1
  }
  return repaired
}
