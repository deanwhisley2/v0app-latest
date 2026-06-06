import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { closedTradeHistorySummary } from "@/lib/nexus-bot/user-session-messaging"
import { creditPrincipalToMainAndEarningsToPocket } from "@/lib/server/copy-trade-balance-credit"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { TRADE_SESSION_RESERVE_SOURCE } from "@/lib/server/trade-session-earnings-reserve"
import { casCreditNexusMainOnly } from "@/lib/server/nexus-main-enforcement"

const EPSILON_USD = 0.005

/** Ledger events that resolve a trade-session participant reservation. */
export const TRADE_SESSION_TERMINAL_RESOLUTION_EVENTS = [
  "nexus_trade_session_complete",
  "nexus_trade_session_reconcile_topup",
  "nexus_trade_session_cancel",
] as const

export type SettlementCreditEnsureResult = {
  applied: boolean
  reason: "initial_credit" | "topup" | "already_settled" | "nothing_due"
}

export async function hasTradeSessionOpenReservation(
  admin: SupabaseClient,
  userId: string,
  botSessionId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("container_balance_events")
    .select("id")
    .eq("user_id", userId)
    .eq("related_session_id", botSessionId)
    .eq("event_type", "nexus_trade_session_open")
    .limit(1)
  if (error) throw new Error(error.message)
  return Boolean(data && data.length > 0)
}

export async function hasTradeSessionCancelEvent(
  admin: SupabaseClient,
  userId: string,
  botSessionId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("container_balance_events")
    .select("id")
    .eq("user_id", userId)
    .eq("related_session_id", botSessionId)
    .eq("event_type", "nexus_trade_session_cancel")
    .limit(1)
  if (error) throw new Error(error.message)
  return Boolean(data && data.length > 0)
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

/** True when settlement, refund (cancel), or earnings top-up exists for this participant. */
export async function hasTradeSessionFinancialResolution(
  admin: SupabaseClient,
  userId: string,
  botSessionId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("container_balance_events")
    .select("id")
    .eq("user_id", userId)
    .eq("related_session_id", botSessionId)
    .in("event_type", [...TRADE_SESSION_TERMINAL_RESOLUTION_EVENTS])
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
  const result = await repairUnsettledTradeSessionParticipants(admin, { userId, limit })
  return result.completedLedgerRepairs
}

export type TradeSessionRepairResult = {
  participantsSettled: number
  completedLedgerRepairs: number
  cancelledRefunded: number
  auditBackfills: number
}

type RepairableRow = {
  id: string
  user_id: string
  status: string
  stake_usd: number | string | null
  profit_released_usd: number | string | null
  trade_session_id: string | null
  queued_at: string | null
  participation_weight: number | string | null
  settled_at: string | null
  ends_at: string | null
}

/**
 * Workflow recovery: settle, refund, or backfill audit for any trade-session participant
 * with an open reservation but missing terminal ledger resolution.
 */
export async function repairUnsettledTradeSessionParticipants(
  admin: SupabaseClient,
  opts?: { userId?: string; limit?: number },
): Promise<TradeSessionRepairResult> {
  const limit = opts?.limit ?? 120
  const nowIso = new Date().toISOString()

  let q = admin
    .from("nexus_bot_sessions")
    .select(
      "id,user_id,status,stake_usd,profit_released_usd,trade_session_id,queued_at,participation_weight,settled_at,ends_at",
    )
    .not("trade_session_id", "is", null)
    .gt("stake_usd", 0)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (opts?.userId) q = q.eq("user_id", opts.userId)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const result: TradeSessionRepairResult = {
    participantsSettled: 0,
    completedLedgerRepairs: 0,
    cancelledRefunded: 0,
    auditBackfills: 0,
  }

  for (const raw of data ?? []) {
    const row = raw as RepairableRow
    const botSessionId = String(row.id)
    const uid = String(row.user_id)
    const status = String(row.status)
    const stake = roundUsd2(Number(row.stake_usd ?? 0))
    if (!(stake > 0)) continue

    const hasOpen = await hasTradeSessionOpenReservation(admin, uid, botSessionId)
    if (!hasOpen) continue

    const resolved = await hasTradeSessionFinancialResolution(admin, uid, botSessionId)
    const hasCancel = await hasTradeSessionCancelEvent(admin, uid, botSessionId)
    const endsAt = row.ends_at ? String(row.ends_at) : null
    const pastDue = Boolean(endsAt && endsAt < nowIso)
    const isOpenStatus = ["booked", "ready", "pending", "running", "active"].includes(status)

    if (status === "completed" && !resolved) {
      const credit = await ensureTradeSessionSettlementCredits(admin, {
        userId: uid,
        botSessionId,
        stakeUsd: stake,
        profitUsd: roundUsd2(Number(row.profit_released_usd ?? 0)),
        tradeSessionId: row.trade_session_id ? String(row.trade_session_id) : null,
        joinedAt: row.queued_at ? String(row.queued_at) : null,
        participationWeight: Number(row.participation_weight ?? 1),
      })
      if (credit.applied) result.completedLedgerRepairs += 1
      continue
    }

    if (status === "cancelled") {
      if (hasCancel && !row.settled_at) {
        const { error: uErr } = await admin
          .from("nexus_bot_sessions")
          .update({ settled_at: nowIso })
          .eq("id", botSessionId)
          .eq("status", "cancelled")
        if (!uErr) result.auditBackfills += 1
      } else if (!hasCancel && !resolved) {
        await casCreditNexusMainOnly(admin, uid, stake)
        await recordFinancialEvent({
          userId: uid,
          eventType: "nexus_trade_session_cancel",
          category: "container",
          amount: stake,
          balanceSource: "nexus_bot_session",
          balanceDestination: "available_balance",
          status: "completed",
          actorType: "system",
          actorId: uid,
          relatedSessionId: botSessionId,
          summary: "Trade booking cancelled — reserved capital returned to Nexus Main.",
          metadata: {
            session_id: botSessionId,
            trade_session_id: row.trade_session_id ?? null,
            stake_returned_usd: stake,
            repair_applied: true,
          },
        })
        await admin
          .from("nexus_bot_sessions")
          .update({ settled_at: nowIso })
          .eq("id", botSessionId)
          .eq("status", "cancelled")
        result.cancelledRefunded += 1
      }
      continue
    }

    const needsSettlement =
      (status === "expired" && !resolved && !hasCancel) ||
      (isOpenStatus && pastDue && !resolved)

    if (!needsSettlement) continue

    const tradeSessionId = String(row.trade_session_id)
    const { data: tsRow, error: tsErr } = await admin
      .from("trade_sessions")
      .select("start_at,end_at,session_slot")
      .eq("id", tradeSessionId)
      .maybeSingle()
    if (tsErr) throw new Error(tsErr.message)
    if (!tsRow?.start_at || !tsRow?.end_at) continue

    const { settleTradeSessionBotParticipant } = await import(
      "@/lib/server/nexus-bot-session-service"
    )
    const settled = await settleTradeSessionBotParticipant(admin, {
      id: botSessionId,
      userId: uid,
      stakeUsd: stake,
      tradeSessionId,
      participationWeight: Number(row.participation_weight ?? 1),
      joinedAt: row.queued_at ? String(row.queued_at) : null,
      sessionStartAt: String(tsRow.start_at),
      sessionEndAt: String(tsRow.end_at),
      sessionSlot: String(tsRow.session_slot ?? "morning"),
      repairFromTerminal: true,
    })
    if (settled) result.participantsSettled += 1
  }

  return result
}
