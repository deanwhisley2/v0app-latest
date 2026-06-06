#!/usr/bin/env npx tsx
/**
 * One-off repair: inject static matrix yields for legacy stuck trade-session
 * participants, then settle principal → Main and profit → Pocket.
 *
 * Usage:
 *   npx tsx scripts/repair-and-clear-stuck-sessions.ts --dry-run
 *   npx tsx scripts/repair-and-clear-stuck-sessions.ts --apply
 *   npx tsx scripts/repair-and-clear-stuck-sessions.ts --apply --launch-test
 */

import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { roundUsd2 } from "../lib/nexus-financial-policy"
import { TRADE_SESSION_OPEN_STATUSES } from "../lib/nexus-bot/user-session-messaging"
import {
  resolveMatrixYieldPercent,
  yieldMatrixDayIndex,
} from "../lib/nexus-bot/trade-session-yield-matrix"
import {
  hasTradeSessionCancelEvent,
  hasTradeSessionFinancialResolution,
  hasTradeSessionOpenReservation,
} from "../lib/server/nexus-bot-settlement-integrity"
import { settleTradeSessionBotParticipant } from "../lib/server/nexus-bot-session-service"
import { computeTradeSessionSettlementMonitoring } from "../lib/server/trade-session-settlement-monitoring"
import {
  calculateTimeWeightedYield,
  hashYieldCalculation,
  YIELD_DISTRIBUTION_LINEAR,
} from "../lib/server/time-weighted-yield-engine"
import {
  generateTradeCodes,
  registerTradeSession,
} from "../lib/server/trade-sessions"

config({ path: resolve(process.cwd(), ".env.local") })

type StuckRow = {
  id: string
  user_id: string
  status: string
  stake_usd: number
  ends_at: string | null
  trade_session_id: string
  queued_at: string | null
  participation_weight: number
}

type TradeSessionRow = {
  id: string
  code: string
  start_at: string
  end_at: string
  session_slot: string
  max_yield_percent: number | null
}

function argFlag(name: string): boolean {
  return process.argv.includes(name)
}

async function findStuckParticipants(admin: ReturnType<typeof createAdminClient>): Promise<StuckRow[]> {
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from("nexus_bot_sessions")
    .select(
      "id,user_id,status,stake_usd,ends_at,trade_session_id,queued_at,participation_weight",
    )
    .not("trade_session_id", "is", null)
    .gt("stake_usd", 0)
    .order("ends_at", { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)

  const stuck: StuckRow[] = []
  for (const raw of data ?? []) {
    const row = raw as StuckRow
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
    if (resolved || hasCancel) continue

    const isOpenStatus = (TRADE_SESSION_OPEN_STATUSES as readonly string[]).includes(status)
    if (isOpenStatus && pastDue) {
      stuck.push({
        ...row,
        id: botSessionId,
        user_id: uid,
        status,
        stake_usd: stake,
        trade_session_id: String(row.trade_session_id),
        participation_weight: Number(row.participation_weight ?? 1),
        queued_at: row.queued_at ? String(row.queued_at) : null,
      })
    }
  }
  return stuck
}

async function loadTradeSession(
  admin: ReturnType<typeof createAdminClient>,
  tradeSessionId: string,
): Promise<TradeSessionRow | null> {
  const { data, error } = await admin
    .from("trade_sessions")
    .select("id,code,start_at,end_at,session_slot,max_yield_percent")
    .eq("id", tradeSessionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: String(data.id),
    code: String(data.code),
    start_at: String(data.start_at),
    end_at: String(data.end_at),
    session_slot: String(data.session_slot ?? "morning"),
    max_yield_percent:
      data.max_yield_percent != null ? Number(data.max_yield_percent) : null,
  }
}

async function injectMatrixYieldForParticipant(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    userId: string
    tradeSessionId: string
    tradeSession: TradeSessionRow
    stakeUsd: number
    joinedAt: string
    participationWeight: number
    dryRun: boolean
  },
): Promise<{
  matrixMaxYieldPercent: number
  earnedPercent: number
  expectedProfitUsd: number
}> {
  const matrixMaxYieldPercent = resolveMatrixYieldPercent(
    params.tradeSession.start_at,
    params.tradeSession.session_slot,
  )
  const joinTime = new Date(params.joinedAt)
  const calculation = calculateTimeWeightedYield({
    sessionId: params.tradeSessionId,
    userId: params.userId,
    capitalAtJoinUsd: params.stakeUsd,
    joinTime,
    sessionStart: new Date(params.tradeSession.start_at),
    sessionEnd: new Date(params.tradeSession.end_at),
    maxYieldPercent: matrixMaxYieldPercent,
  })
  if (calculation.rejected) {
    throw new Error(calculation.rejectionReason ?? "YIELD_CALC_REJECTED")
  }

  if (!params.dryRun) {
    const { error: tsErr } = await admin
      .from("trade_sessions")
      .update({
        max_yield_percent: matrixMaxYieldPercent,
        profit_percentage: matrixMaxYieldPercent,
        yield_distribution_mode: YIELD_DISTRIBUTION_LINEAR,
      })
      .eq("id", params.tradeSessionId)
    if (tsErr) throw new Error(tsErr.message)

    const patch = {
      profit_percentage: calculation.earnedPercent,
      earned_percent: calculation.earnedPercent,
      expected_profit_usd: calculation.profitUsd,
      capital_at_join_usd: roundUsd2(params.stakeUsd),
      participation_weight: params.participationWeight,
      effective_start_time: calculation.effectiveStartTime.toISOString(),
      participation_ratio: calculation.participationRatio,
      is_early_bird: calculation.isEarlyBird,
      settled: false,
      settled_at: null,
    }

    const { data: existing } = await admin
      .from("session_participant_profit_percentages")
      .select("id")
      .eq("user_id", params.userId)
      .eq("session_id", params.tradeSessionId)
      .maybeSingle()

    if (existing?.id) {
      const { error: upErr } = await admin
        .from("session_participant_profit_percentages")
        .update(patch)
        .eq("id", existing.id)
      if (upErr) throw new Error(upErr.message)
    } else {
      const { error: insErr } = await admin.from("session_participant_profit_percentages").insert({
        session_id: params.tradeSessionId,
        user_id: params.userId,
        ...patch,
      })
      if (insErr) throw new Error(insErr.message)
    }

    const idempotencyKey = `yield_join:${params.tradeSessionId}:${params.userId}`
    const { error: idemErr } = await admin.from("session_join_idempotency").insert({
      idempotency_key: idempotencyKey,
      session_id: params.tradeSessionId,
      user_id: params.userId,
    })
    if (idemErr && idemErr.code !== "23505") throw new Error(idemErr.message)

    await admin.from("yield_calculation_audit").insert({
      session_id: params.tradeSessionId,
      user_id: params.userId,
      join_time: joinTime.toISOString(),
      effective_start: calculation.effectiveStartTime.toISOString(),
      max_yield_percent: matrixMaxYieldPercent,
      earned_percent: calculation.earnedPercent,
      profit_usd: calculation.profitUsd,
      calculation_hash: hashYieldCalculation(calculation),
    })
  }

  return {
    matrixMaxYieldPercent,
    earnedPercent: calculation.earnedPercent,
    expectedProfitUsd: calculation.profitUsd,
  }
}

async function resolveAdminActorId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const fromEnv =
    process.env.LIQUIDITY_ADMIN_USER_ID?.trim() ||
    process.env.NEXUS_ADMIN_USER_IDS?.split(",")[0]?.trim() ||
    process.env.NEXUS_ADMIN_RETAIL_POOL_USER_ID?.trim()
  if (fromEnv) return fromEnv

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("trading_user_level", 5)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ? String(data.id) : null
}

async function launchTenMinuteTestSession(
  admin: ReturnType<typeof createAdminClient>,
  dryRun: boolean,
): Promise<void> {
  const actorId = await resolveAdminActorId(admin)
  if (!actorId) {
    console.warn("[launch-test] No Level-5 admin actor found — skipping test session creation")
    return
  }

  const start = new Date(Date.now() + 60_000)
  const end = new Date(start.getTime() + 10 * 60_000)
  const sessionSlot = start.getUTCHours() < 12 ? "morning" : "evening"
  const matrixPct = resolveMatrixYieldPercent(start, sessionSlot)
  const dayIndex = yieldMatrixDayIndex(start)

  console.log("\n[launch-test] 10-minute matrix session plan:")
  console.log(`  slot=${sessionSlot} matrixDay=${dayIndex + 1} maxYield=${matrixPct}%`)
  console.log(`  start=${start.toISOString()} end=${end.toISOString()}`)
  console.log(
    `  late-join example (3 min late): earned% = ${((7 / 10) * matrixPct).toFixed(4)}% of base`,
  )

  if (dryRun) return

  const codes = await generateTradeCodes(admin, actorId, 1)
  const code = codes[0]
  if (!code) throw new Error("CODE_GENERATION_FAILED")

  const registered = await registerTradeSession(admin, {
    actorId,
    code,
    sessionName: "Matrix Live Test 10m",
    sessionSlot,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    status: "active",
    displayLabel: "Matrix Live Test",
  })

  console.log("[launch-test] Registered session:")
  console.log(`  code=${registered.code} maxYield=${registered.maxYieldPercent}% id=${registered.sessionId}`)
}

async function main() {
  const dryRun = !argFlag("--apply")
  const launchTest = argFlag("--launch-test")

  const admin = createAdminClient()
  const stuck = await findStuckParticipants(admin)
  const totalStake = roundUsd2(stuck.reduce((s, r) => s + r.stake_usd, 0))

  console.log(`[repair] mode=${dryRun ? "DRY_RUN" : "APPLY"} stuckParticipants=${stuck.length} totalStakeUsd=${totalStake}`)

  const tradeSessionCache = new Map<string, TradeSessionRow>()
  let repaired = 0
  let settled = 0
  const failures: Array<{ botSessionId: string; error: string }> = []

  for (const row of stuck) {
    try {
      let ts = tradeSessionCache.get(row.trade_session_id)
      if (!ts) {
        const loaded = await loadTradeSession(admin, row.trade_session_id)
        if (!loaded) throw new Error("TRADE_SESSION_NOT_FOUND")
        ts = loaded
        tradeSessionCache.set(row.trade_session_id, ts)
      }

      const joinedAt = row.queued_at ?? ts.start_at
      const priorMax = ts.max_yield_percent

      const inj = await injectMatrixYieldForParticipant(admin, {
        userId: row.user_id,
        tradeSessionId: row.trade_session_id,
        tradeSession: ts,
        stakeUsd: row.stake_usd,
        joinedAt,
        participationWeight: row.participation_weight,
        dryRun,
      })

      console.log(
        `[repair] bot=${row.id.slice(0, 8)} user=${row.user_id.slice(0, 8)} stake=$${row.stake_usd} ` +
          `status=${row.status} matrixDay=${yieldMatrixDayIndex(ts.start_at) + 1} ` +
          `maxYield ${priorMax ?? "?"}→${inj.matrixMaxYieldPercent}% earned=${inj.earnedPercent}% profit=$${inj.expectedProfitUsd}`,
      )

      if (!dryRun) {
        const result = await settleTradeSessionBotParticipant(admin, {
          id: row.id,
          userId: row.user_id,
          stakeUsd: row.stake_usd,
          tradeSessionId: row.trade_session_id,
          participationWeight: row.participation_weight,
          joinedAt,
          sessionStartAt: ts.start_at,
          sessionEndAt: ts.end_at,
          sessionSlot: ts.session_slot,
          repairFromTerminal: true,
        })
        if (result) {
          settled += 1
          console.log(`  → settled profitUsd=$${result.profitUsd}`)
        } else {
          failures.push({ botSessionId: row.id, error: "SETTLEMENT_RETURNED_NULL" })
        }
      }

      repaired += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      failures.push({ botSessionId: row.id, error: msg })
      console.error(`[repair] FAIL bot=${row.id}: ${msg}`)
    }
  }

  const monitoring = await computeTradeSessionSettlementMonitoring(admin)
  console.log("\n[repair] summary:")
  console.log(`  repaired=${repaired} settled=${settled} failures=${failures.length}`)
  console.log(
    `  strandedUsd=${monitoring.totalStrandedStakeUsd} pastDueOpen=${monitoring.pastDueOpenParticipantCount} ok=${!monitoring.hasStrandedCapital}`,
  )
  if (failures.length > 0) console.log("  failures:", failures)

  if (launchTest) {
    await launchTenMinuteTestSession(admin, dryRun)
  }

  if (!dryRun && monitoring.hasStrandedCapital) {
    process.exit(1)
  }
}

void main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.message : e)
  process.exit(1)
})
