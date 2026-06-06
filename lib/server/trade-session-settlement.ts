import type { SupabaseClient } from "@supabase/supabase-js"
import {
  getStoredYieldParticipant,
  markYieldParticipantSettled,
  tradeSessionUsesYieldEngine,
} from "@/lib/server/time-weighted-yield-engine"

/** Session-only settlement — reads stored join-time expected_profit_usd (no reserve ledger). */
export async function settleTradeSessionParticipation(
  admin: SupabaseClient,
  params: {
    userId: string
    tradeSessionId: string
    sessionStartAt: string
    sessionSlot: string
    capitalUsd: number
    participationWeight: number
    forceFullParticipation?: boolean
    joinedAt?: string | null
  },
): Promise<{
  profitUsd: number
  allocatedUsd: number
  minFloorApplied: boolean
  usedYieldEngine: boolean
  earnedPercent?: number
  maxYieldPercent?: number
  participationRatio?: number
  isEarlyBird?: boolean
  capitalAtJoinUsd?: number
}> {
  void params.sessionStartAt
  void params.sessionSlot
  void params.capitalUsd
  void params.participationWeight
  void params.forceFullParticipation
  void params.joinedAt

  const { data: tsRow, error: tsErr } = await admin
    .from("trade_sessions")
    .select("max_yield_percent,yield_distribution_mode")
    .eq("id", params.tradeSessionId)
    .maybeSingle()
  if (tsErr) throw new Error(tsErr.message)

  if (!tradeSessionUsesYieldEngine(tsRow ?? {})) {
    throw new Error("LEGACY_EARNINGS_DISABLED")
  }

  const yieldParticipant = await getStoredYieldParticipant(admin, params.userId, params.tradeSessionId)
  if (!yieldParticipant) {
    throw new Error("PARTICIPANT_YIELD_RECORD_MISSING")
  }

  const payoutUsd = yieldParticipant.expectedProfitUsd

  if (!yieldParticipant.settled) {
    await markYieldParticipantSettled(admin, params.userId, params.tradeSessionId)
  }

  return {
    profitUsd: payoutUsd,
    allocatedUsd: payoutUsd,
    minFloorApplied: false,
    usedYieldEngine: true,
    earnedPercent: yieldParticipant.earnedPercent,
    maxYieldPercent: Number(tsRow?.max_yield_percent ?? 0),
    participationRatio: yieldParticipant.participationRatio,
    isEarlyBird: yieldParticipant.isEarlyBird,
    capitalAtJoinUsd: yieldParticipant.capitalAtJoinUsd,
  }
}
