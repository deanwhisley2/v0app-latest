#!/usr/bin/env npx tsx
/**
 * Nexus Bot settlement reconciliation.
 *
 * Why:
 * - If settlement ran out of order (forfeitures vs participant settlement),
 *   some bot participants may end up with profit_released_usd = 0 even though
 *   they should have earned.
 * - This script recomputes the correct per-user profit from ledger/reserve state
 *   and (optionally) credits any missing earnings to the user's pocket
 *   (container_withdrawable_earnings), updating nexus_bot_sessions.profit_released_usd
 *   so the celebration modal can trigger on next dashboard load.
 *
 * Usage examples:
 *   npx tsx scripts/reconcile-nexus-bot-settlement.ts --since-hours 24
 *   npx tsx scripts/reconcile-nexus-bot-settlement.ts --since-hours 24 --apply
 *   npx tsx scripts/reconcile-nexus-bot-settlement.ts --user-id <uuid> --apply
 */

import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { roundUsd2 } from "../lib/nexus-financial-policy"
import { recordFinancialEvent } from "../lib/server/financial-events"
import { creditPrincipalToMainAndEarningsToPocket } from "../lib/server/copy-trade-balance-credit"
import { getStoredYieldParticipant } from "../lib/server/time-weighted-yield-engine"
import { settleTradeSessionParticipation } from "../lib/server/trade-session-settlement"

config({ path: resolve(process.cwd(), ".env.local") })

function argFlag(name: string): boolean {
  return process.argv.includes(name)
}

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1]?.trim() ?? null
}

function usageAndExit(): never {
  console.error(
    "Usage: npx tsx scripts/reconcile-nexus-bot-settlement.ts --since-hours <N> [--limit <N>] [--user-id <uuid>] [--apply]",
  )
  process.exit(1)
}

const EPSILON_USD = 0.01

async function main() {
  const sinceHoursRaw = argValue("--since-hours") ?? argValue("--sinceHours")
  const sinceHours = sinceHoursRaw ? Number(sinceHoursRaw) : 24
  if (!Number.isFinite(sinceHours) || sinceHours <= 0) usageAndExit()

  const limitRaw = argValue("--limit") ?? "200"
  const limit = Number(limitRaw)
  if (!Number.isFinite(limit) || limit <= 0) usageAndExit()

  const userId = argValue("--user-id")
  const apply = argFlag("--apply")

  const sinceIso = new Date(Date.now() - sinceHours * 3_600_000).toISOString()

  const admin = createAdminClient()

  const { data: botSessions, error: botErr } = await admin
    .from("nexus_bot_sessions")
    .select(
      "id,user_id,trade_session_id,stake_usd,profit_released_usd,participation_weight,queued_at,settled_at",
    )
    .eq("status", "completed")
    .not("trade_session_id", "is", null)
    .gte("settled_at", sinceIso)
    .order("settled_at", { ascending: false })
    .limit(limit)
  if (botErr) throw new Error(botErr.message)

  const rows = botSessions ?? []
  if (rows.length === 0) {
    console.log(`[reconcile-nexus-bot-settlement] No completed nexus_bot_sessions since ${sinceIso}`)
    return
  }

  const tradeSessionIds = [...new Set(rows.map((r) => String(r.trade_session_id)))]

  const { data: tradeSessions, error: tsErr } = await admin
    .from("trade_sessions")
    .select("id,start_at,session_slot")
    .in("id", tradeSessionIds)
  if (tsErr) throw new Error(tsErr.message)

  const tradeById = new Map(
    (tradeSessions ?? []).map((ts) => [
      String(ts.id),
      { start_at: String(ts.start_at), session_slot: String(ts.session_slot ?? "morning") },
    ]),
  )

  let checked = 0
  let candidates = 0
  let applied = 0
  let totalTopUpUsd = 0
  const skipped: Array<{ bot_session_id: string; reason: string }> = []
  const failures: Array<{ bot_session_id: string; error: string }> = []

  for (const bs of rows) {
    if (userId && String(bs.user_id) !== userId) continue
    const botSessionId = String(bs.id)
    const uid = String(bs.user_id)
    const tradeSessionId = String(bs.trade_session_id)

    const ts = tradeById.get(tradeSessionId)
    if (!ts) {
      skipped.push({ bot_session_id: botSessionId, reason: "missing_trade_session_row" })
      continue
    }

    const oldProfitUsd = roundUsd2(Number(bs.profit_released_usd ?? 0))
    const stakeUsd = roundUsd2(Number(bs.stake_usd ?? 0))
    const participationWeight = Number(bs.participation_weight ?? 1)
    const queuedAt = bs.queued_at ? String(bs.queued_at) : null

    const stored = await getStoredYieldParticipant(admin, uid, tradeSessionId)
    if (!stored) {
      skipped.push({ bot_session_id: botSessionId, reason: "missing_yield_participant_row" })
      continue
    }

    const simulatedProfitUsd = roundUsd2(stored.expectedProfitUsd)

    checked += 1
    const delta = roundUsd2(simulatedProfitUsd - oldProfitUsd)
    if (!(delta > EPSILON_USD)) {
      continue
    }
    candidates += 1

    if (!apply) {
      console.log(
        `[reconcile] candidate ${botSessionId} uid=${uid} stake=${stakeUsd.toFixed(2)} oldProfit=${oldProfitUsd.toFixed(2)} simulatedProfit=${roundUsd2(
          simulatedProfitUsd,
        ).toFixed(2)} delta=${delta.toFixed(2)}`,
      )
      continue
    }

    try {
      // Re-run settlement for the exact profit number (this may reverse an erroneous forfeit ledger).
      const settled = await settleTradeSessionParticipation(admin, {
        userId: uid,
        tradeSessionId,
        sessionStartAt: ts.start_at,
        sessionSlot: ts.session_slot,
        capitalUsd: stakeUsd,
        participationWeight,
        joinedAt: queuedAt,
      })

      const newProfitUsd = roundUsd2(settled.profitUsd)
      const topUpEarningsUsd = roundUsd2(newProfitUsd - oldProfitUsd)

      if (!(topUpEarningsUsd > EPSILON_USD)) {
        skipped.push({ bot_session_id: botSessionId, reason: "after_settlement_no_delta" })
        continue
      }

      // If the original financial event is missing, credit principal+earnings.
      const { data: existingEv } = await admin
        .from("container_balance_events")
        .select("id")
        .eq("related_session_id", botSessionId)
        .eq("event_type", "nexus_trade_session_complete")
        .maybeSingle()
      const evExists = Boolean(existingEv)

      if (!evExists) {
        await creditPrincipalToMainAndEarningsToPocket(admin, uid, stakeUsd, newProfitUsd)
        await recordFinancialEvent({
          userId: uid,
          eventType: "nexus_trade_session_complete",
          category: "container",
          amount: roundUsd2(stakeUsd + newProfitUsd),
          balanceSource: "nexus_bot_session",
          balanceDestination:
            newProfitUsd > 0 && stakeUsd > 0
              ? "available_balance,container_withdrawable_earnings"
              : newProfitUsd > 0
                ? "container_withdrawable_earnings"
                : "available_balance",
          status: "completed",
          actorType: "system",
          actorId: uid,
          relatedSessionId: botSessionId,
          summary: "Nexus Bot session reconciled — initial settlement credits restored.",
          metadata: {
            session_id: botSessionId,
            trade_session_id: tradeSessionId,
            reconciled_profit_usd: newProfitUsd,
          },
        })
      } else {
        // Original settlement event exists; credit only missing earnings to pocket.
        await creditPrincipalToMainAndEarningsToPocket(admin, uid, 0, topUpEarningsUsd)
        await recordFinancialEvent({
          userId: uid,
          eventType: "nexus_trade_session_reconcile_topup",
          category: "container",
          amount: topUpEarningsUsd,
          balanceSource: "nexus_bot_session_reconciliation",
          balanceDestination: "container_withdrawable_earnings",
          status: "completed",
          actorType: "system",
          actorId: uid,
          relatedSessionId: botSessionId,
          summary: `Reconciliation top-up — released earnings credited (${topUpEarningsUsd.toFixed(2)} USD).`,
          metadata: {
            session_id: botSessionId,
            trade_session_id: tradeSessionId,
            previous_profit_usd: oldProfitUsd,
            reconciled_profit_usd: newProfitUsd,
          },
        })
      }

      await admin
        .from("nexus_bot_sessions")
        .update({ profit_released_usd: newProfitUsd, display_phase: "profit_released" })
        .eq("id", botSessionId)
        .eq("user_id", uid)

      applied += 1
      totalTopUpUsd += topUpEarningsUsd
      console.log(`[reconcile] OK ${botSessionId} +${topUpEarningsUsd.toFixed(2)} USD`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      failures.push({ bot_session_id: botSessionId, error: msg })
      console.error(`[reconcile] FAIL ${botSessionId}:`, msg)
    }
  }

  console.log(
    `[reconcile-nexus-bot-settlement] sinceHours=${sinceHours} apply=${apply}\n` +
      `checked=${checked} candidates=${candidates} applied=${applied} totalTopUpUsd=${totalTopUpUsd.toFixed(2)}\n` +
      `skipped=${skipped.length} failures=${failures.length}`,
  )
  if (failures.length > 0) {
    console.log("Failures:", failures)
  }
}

void main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.message : e)
  process.exit(1)
})

