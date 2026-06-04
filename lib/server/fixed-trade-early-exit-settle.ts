import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import type { EarlyExitSettlementUsd } from "@/lib/nexus-financial-policy"
import {
  assertSettlementEarnedWithinUnreleased,
  computeFixedTradeEarningsConservation,
} from "@/lib/server/fixed-trade-earnings-conservation"
import type { FixedSessionEarnedRow } from "@/lib/server/fixed-trade-earnings-snapshot"

export type FixedTradeEarlyExitResult = {
  settlement: EarlyExitSettlementUsd & {
    totalModeledEarnedUsd: number
    cumulativeReleasedUsd: number
    unreleasedEarnedUsd: number
    mainCreditUsd: number
    liquidCreditUsd: number
    earningsFeeUsd: number
  }
  balances: {
    available_balance: number
    current_stake: number
    container_withdrawable_earnings: number
  }
  sessionId: string
  transactionRef: string
}

function mapRpcSettlement(rpc: Record<string, unknown>): FixedTradeEarlyExitResult["settlement"] {
  const num = (k: string) => roundUsd2(Number(rpc[k] ?? 0))
  return {
    principalUsd: num("principal_usd"),
    sessionEarnedUsd: num("session_earned_usd"),
    agreementPenaltyUsd: num("agreement_penalty_usd"),
    insuranceExitFromPrincipalUsd: num("insurance_exit_from_principal_usd"),
    netPrincipalReturnedUsd: num("net_principal_returned_usd"),
    totalCreditedToMainUsd: num("total_credited_to_main_usd"),
    mainCreditUsd: num("main_credit_usd"),
    liquidCreditUsd: num("liquid_credit_usd"),
    earningsFeeUsd: num("earnings_fee_usd"),
    totalModeledEarnedUsd: num("total_modeled_earned_usd"),
    cumulativeReleasedUsd: num("cumulative_released_usd"),
    unreleasedEarnedUsd: num("unreleased_earned_usd"),
  }
}

/**
 * Server-only early exit via Postgres RPC (conservation enforced in DB).
 * Pre-flight TS conservation check mirrors RPC for clearer API errors when RPC is stale.
 */
export async function settleFixedTradeEarlyExitForUser(
  admin: SupabaseClient,
  params: { userId: string; sessionId: string },
): Promise<FixedTradeEarlyExitResult> {
  const { userId, sessionId } = params

  const { data: row, error: loadErr } = await admin
    .from("fixed_trade_sessions")
    .select(
      "id,user_id,principal_amount,insurance_fee_amount,fix_period_months,status,seed_key,created_at,metadata,cumulative_earnings_released_usd",
    )
    .eq("id", sessionId)
    .maybeSingle()
  if (loadErr) throw new Error(loadErr.message)
  if (!row) throw new Error("SESSION_NOT_FOUND")
  if (row.user_id !== userId) throw new Error("FORBIDDEN")
  if (row.status !== "active") throw new Error("EARLY_EXIT_NOT_ALLOWED")

  const snap = computeFixedTradeEarningsConservation(row as FixedSessionEarnedRow, new Date())
  assertSettlementEarnedWithinUnreleased(snap, snap.unreleasedEarnedUsd, "early-exit-preflight")

  const { data: rpcRaw, error: rpcErr } = await admin.rpc("fixed_trade_finalize_early_exit_v1", {
    p_session_id: sessionId,
    p_user_id: userId,
  })
  if (rpcErr) throw new Error(rpcErr.message)

  const rpc = rpcRaw as Record<string, unknown> | null
  if (!rpc || rpc.ok !== true) {
    const err = typeof rpc?.error === "string" ? rpc.error : "EARLY_EXIT_RPC_FAILED"
    throw new Error(err)
  }

  const settlement = mapRpcSettlement(rpc)
  if (settlement.unreleasedEarnedUsd > snap.unreleasedEarnedUsd + 0.02) {
    throw new Error("EARLY_EXIT_RPC_CONSERVATION_MISMATCH")
  }

  return {
    settlement,
    balances: {
      available_balance: roundUsd2(Number(rpc.available_balance ?? 0)),
      current_stake: roundUsd2(Number(rpc.current_stake ?? 0)),
      container_withdrawable_earnings: roundUsd2(Number(rpc.container_withdrawable_earnings ?? 0)),
    },
    sessionId,
    transactionRef: String(rpc.transaction_ref ?? ""),
  }
}
