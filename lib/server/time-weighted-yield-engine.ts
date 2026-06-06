import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

export const YIELD_DISTRIBUTION_LINEAR = "LINEAR_TIME_WEIGHTED" as const

export type YieldCalculationInput = {
  sessionId: string
  userId: string
  capitalAtJoinUsd: number
  joinTime: Date
  sessionStart: Date
  sessionEnd: Date
  maxYieldPercent: number
}

export type YieldCalculationOutput = {
  earnedPercent: number
  profitUsd: number
  participationRatio: number
  effectiveStartTime: Date
  isEarlyBird: boolean
  rejected: boolean
  rejectionReason?: string
}

export type YieldSessionPreview = {
  durationHours: number
  maxYieldPercent: number
  examples: Array<{ label: string; earnedPercent: number; joinOffsetHours: number }>
}

function roundPct4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

function getHoursDiff(end: Date, start: Date): number {
  return (end.getTime() - start.getTime()) / 3_600_000
}

/** Pure, deterministic time-weighted yield calculation. */
export function calculateTimeWeightedYield(input: YieldCalculationInput): YieldCalculationOutput {
  const { capitalAtJoinUsd, joinTime, sessionStart, sessionEnd, maxYieldPercent } = input

  if (joinTime.getTime() > sessionEnd.getTime()) {
    return {
      earnedPercent: 0,
      profitUsd: 0,
      participationRatio: 0,
      effectiveStartTime: joinTime,
      isEarlyBird: false,
      rejected: true,
      rejectionReason: "JOINED_AFTER_SESSION_END",
    }
  }

  const durationHours = getHoursDiff(sessionEnd, sessionStart)
  if (!(durationHours > 0)) {
    return {
      earnedPercent: 0,
      profitUsd: 0,
      participationRatio: 0,
      effectiveStartTime: joinTime,
      isEarlyBird: false,
      rejected: true,
      rejectionReason: "ZERO_DURATION_SESSION",
    }
  }

  const isEarlyBird = joinTime.getTime() <= sessionStart.getTime()
  const effectiveStartTime = isEarlyBird ? sessionStart : joinTime
  const remainingHours = Math.max(0, getHoursDiff(sessionEnd, effectiveStartTime))
  const participationRatio = remainingHours / durationHours

  let earnedPercent = isEarlyBird ? maxYieldPercent : participationRatio * maxYieldPercent
  earnedPercent = roundPct4(earnedPercent)

  const profitUsd = roundUsd2((capitalAtJoinUsd * earnedPercent) / 100)

  return {
    earnedPercent,
    profitUsd,
    participationRatio: Math.round(participationRatio * 1_000_000) / 1_000_000,
    effectiveStartTime,
    isEarlyBird,
    rejected: false,
  }
}

export function hashYieldCalculation(calc: YieldCalculationOutput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        p: calc.participationRatio,
        e: calc.earnedPercent,
        pr: calc.profitUsd,
        eb: calc.isEarlyBird,
      }),
    )
    .digest("hex")
    .slice(0, 32)
}

export function buildYieldSessionPreview(
  sessionStart: Date,
  sessionEnd: Date,
  maxYieldPercent: number,
): YieldSessionPreview {
  const durationHours = getHoursDiff(sessionEnd, sessionStart)
  const offsets = [
    { label: "Early bird (joins before/at start)", joinOffsetHours: -0.5 },
    { label: "Joins at 25% of session elapsed", joinOffsetHours: durationHours * 0.25 },
    { label: "Joins at 50% of session elapsed", joinOffsetHours: durationHours * 0.5 },
    { label: "Joins at 75% of session elapsed", joinOffsetHours: durationHours * 0.75 },
    { label: "Joins at session end", joinOffsetHours: durationHours },
  ]

  const examples = offsets.map(({ label, joinOffsetHours }) => {
    const joinTime = new Date(sessionStart.getTime() + joinOffsetHours * 3_600_000)
    const calc = calculateTimeWeightedYield({
      sessionId: "preview",
      userId: "preview",
      capitalAtJoinUsd: 1000,
      joinTime,
      sessionStart,
      sessionEnd,
      maxYieldPercent,
    })
    return { label, earnedPercent: calc.earnedPercent, joinOffsetHours }
  })

  return { durationHours: roundPct4(durationHours), maxYieldPercent, examples }
}

export function validateMaxYieldPercent(raw: unknown): number {
  const pct = roundPct4(Number(raw))
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    throw new Error("MAX_YIELD_PERCENT_INVALID")
  }
  return pct
}

export type StoredYieldParticipant = {
  profitPercentage: number
  earnedPercent: number
  expectedProfitUsd: number
  capitalAtJoinUsd: number
  participationWeight: number
  participationRatio: number
  effectiveStartTime: string
  isEarlyBird: boolean
  settled: boolean
  assignedAt: string
}

export async function getStoredYieldParticipant(
  admin: SupabaseClient,
  userId: string,
  tradeSessionId: string,
): Promise<StoredYieldParticipant | null> {
  const { data, error } = await admin
    .from("session_participant_profit_percentages")
    .select(
      "profit_percentage,earned_percent,expected_profit_usd,capital_at_join_usd,participation_weight,participation_ratio,effective_start_time,is_early_bird,settled,assigned_at",
    )
    .eq("user_id", userId)
    .eq("session_id", tradeSessionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  const earnedPercent = roundPct4(Number(data.earned_percent ?? data.profit_percentage ?? 0))
  const expectedProfitUsd =
    data.expected_profit_usd != null
      ? roundUsd2(Number(data.expected_profit_usd))
      : roundUsd2(
          Number(data.capital_at_join_usd ?? 0) *
            (earnedPercent / 100) *
            Number(data.participation_weight ?? 1),
        )

  return {
    profitPercentage: earnedPercent,
    earnedPercent,
    expectedProfitUsd,
    capitalAtJoinUsd: roundUsd2(Number(data.capital_at_join_usd ?? 0)),
    participationWeight: Number(data.participation_weight ?? 1),
    participationRatio: Number(data.participation_ratio ?? 0),
    effectiveStartTime: String(data.effective_start_time ?? data.assigned_at),
    isEarlyBird: Boolean(data.is_early_bird),
    settled: Boolean(data.settled),
    assignedAt: String(data.assigned_at),
  }
}

export function tradeSessionUsesYieldEngine(row: {
  max_yield_percent?: number | string | null
  yield_distribution_mode?: string | null
}): boolean {
  const max = Number(row.max_yield_percent ?? 0)
  return max > 0 && String(row.yield_distribution_mode ?? YIELD_DISTRIBUTION_LINEAR) === YIELD_DISTRIBUTION_LINEAR
}

/**
 * Join participant: calculate yield, persist audit + idempotency. Settlement reads stored values only.
 */
export async function joinTradeSessionWithYieldEngine(
  admin: SupabaseClient,
  params: {
    userId: string
    tradeSessionId: string
    capitalAtJoinUsd: number
    joinTime: Date
    participationWeight: number
    sessionStartAt: string
    sessionEndAt: string
    maxYieldPercent: number
  },
): Promise<{ calculation: YieldCalculationOutput; alreadyJoined: boolean }> {
  const idempotencyKey = `yield_join:${params.tradeSessionId}:${params.userId}`

  const { data: existingKey } = await admin
    .from("session_join_idempotency")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
  if (existingKey) {
    const stored = await getStoredYieldParticipant(admin, params.userId, params.tradeSessionId)
    if (stored) {
      return {
        alreadyJoined: true,
        calculation: {
          earnedPercent: stored.earnedPercent,
          profitUsd: stored.expectedProfitUsd,
          participationRatio: stored.participationRatio,
          effectiveStartTime: new Date(stored.effectiveStartTime),
          isEarlyBird: stored.isEarlyBird,
          rejected: false,
        },
      }
    }
  }

  const sessionStart = new Date(params.sessionStartAt)
  const sessionEnd = new Date(params.sessionEndAt)
  const calculation = calculateTimeWeightedYield({
    sessionId: params.tradeSessionId,
    userId: params.userId,
    capitalAtJoinUsd: params.capitalAtJoinUsd,
    joinTime: params.joinTime,
    sessionStart,
    sessionEnd,
    maxYieldPercent: params.maxYieldPercent,
  })

  if (calculation.rejected) {
    throw new Error(calculation.rejectionReason ?? "YIELD_JOIN_REJECTED")
  }

  const { error: insErr } = await admin.from("session_participant_profit_percentages").insert({
    session_id: params.tradeSessionId,
    user_id: params.userId,
    profit_percentage: calculation.earnedPercent,
    capital_at_join_usd: roundUsd2(params.capitalAtJoinUsd),
    participation_weight: params.participationWeight,
    effective_start_time: calculation.effectiveStartTime.toISOString(),
    participation_ratio: calculation.participationRatio,
    earned_percent: calculation.earnedPercent,
    expected_profit_usd: calculation.profitUsd,
    is_early_bird: calculation.isEarlyBird,
    settled: false,
  })
  if (insErr) {
    if (insErr.code === "23505") {
      const stored = await getStoredYieldParticipant(admin, params.userId, params.tradeSessionId)
      if (stored) {
        return {
          alreadyJoined: true,
          calculation: {
            earnedPercent: stored.earnedPercent,
            profitUsd: stored.expectedProfitUsd,
            participationRatio: stored.participationRatio,
            effectiveStartTime: new Date(stored.effectiveStartTime),
            isEarlyBird: stored.isEarlyBird,
            rejected: false,
          },
        }
      }
    }
    throw new Error(insErr.message)
  }

  const calcHash = hashYieldCalculation(calculation)
  await admin.from("yield_calculation_audit").insert({
    session_id: params.tradeSessionId,
    user_id: params.userId,
    join_time: params.joinTime.toISOString(),
    effective_start: calculation.effectiveStartTime.toISOString(),
    max_yield_percent: params.maxYieldPercent,
    earned_percent: calculation.earnedPercent,
    profit_usd: calculation.profitUsd,
    calculation_hash: calcHash,
  })

  await admin.from("session_join_idempotency").insert({
    idempotency_key: idempotencyKey,
    session_id: params.tradeSessionId,
    user_id: params.userId,
  })

  await admin
    .from("trade_sessions")
    .update({ profit_percentage_locked_at: new Date().toISOString() })
    .eq("id", params.tradeSessionId)
    .is("profit_percentage_locked_at", null)

  return { calculation, alreadyJoined: false }
}

export async function markYieldParticipantSettled(
  admin: SupabaseClient,
  userId: string,
  tradeSessionId: string,
): Promise<void> {
  const { error } = await admin
    .from("session_participant_profit_percentages")
    .update({ settled: true, settled_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("session_id", tradeSessionId)
  if (error) throw new Error(error.message)
}

export function buildSettlementYieldAuditMetadata(params: {
  tradeSessionId: string
  maxYieldPercent: number
  earnedPercent: number
  capitalAtJoinUsd: number
  participationRatio: number
  profitAmountUsd: number
  settlementAmountUsd: number
  isEarlyBird: boolean
}): Record<string, unknown> {
  return {
    trade_session_id: params.tradeSessionId,
    max_yield_percent: roundPct4(params.maxYieldPercent),
    profit_percentage_used: roundPct4(params.earnedPercent),
    earned_percent: roundPct4(params.earnedPercent),
    capital_at_join_usd: roundUsd2(params.capitalAtJoinUsd),
    participation_ratio: params.participationRatio,
    profit_amount_usd: roundUsd2(params.profitAmountUsd),
    settlement_amount_usd: roundUsd2(params.settlementAmountUsd),
    is_early_bird: params.isEarlyBird,
    earnings_source: "time_weighted_yield_engine_v2",
    yield_distribution_mode: YIELD_DISTRIBUTION_LINEAR,
  }
}
