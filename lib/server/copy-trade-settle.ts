import type { SupabaseClient } from "@supabase/supabase-js"
import { estimateCopyForcePulloutUsd } from "@/lib/copy-trade-policy"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { applyCopyTradeSettlementCredits, splitCopySettlementMainVsLiquid } from "@/lib/server/copy-trade-balance-credit"

export type CopyTradeSettlementPayload = {
  stakeUsd: number
  grossBeforeFeesUsd: number
  cancelFeeUsd: number
  withdrawFeeUsd: number
  netToMainUsd: number
  mainCreditUsd: number
  liquidCreditUsd: number
}

export async function settleCopyTradeSessionForUser(
  admin: SupabaseClient,
  params: {
    userId: string
    sessionId: string
    floatingPnLUsd: number
    coinImpactFraction: number
    /** User POST vs automated expiry sweep. */
    financialActorType?: "user" | "system"
  },
): Promise<{ settlement: CopyTradeSettlementPayload; balances: { available_balance: number; container_withdrawable_earnings: number } }> {
  const { userId, sessionId, floatingPnLUsd, coinImpactFraction, financialActorType = "user" } = params

  const { data: row, error: fErr } = await admin
    .from("copy_trade_sessions")
    .select("id,user_id,stake_amount,status")
    .eq("id", sessionId)
    .maybeSingle()
  if (fErr) throw new Error(fErr.message)
  if (!row) throw new Error("Session not found")
  if (row.user_id !== userId) throw new Error("Forbidden")
  if (row.status !== "active") throw new Error("Session already closed")

  const stakeUsd = roundUsd2(Number(row.stake_amount ?? 0))
  const settlement = estimateCopyForcePulloutUsd({
    stakeUsd,
    floatingPnLUsd: Number.isFinite(floatingPnLUsd) ? floatingPnLUsd : 0,
    coinImpactFraction: Number.isFinite(coinImpactFraction) ? coinImpactFraction : 0,
  })

  const netToMain = settlement.netToMainUsd
  const { mainCredit, liquidCredit } = splitCopySettlementMainVsLiquid(netToMain, stakeUsd)
  const now = new Date().toISOString()

  const { data: claimed, error: claimErr } = await admin
    .from("copy_trade_sessions")
    .update({ settled_at: now })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("settled_at", null)
    .select("id")
    .maybeSingle()
  if (claimErr) throw new Error(claimErr.message)
  if (!claimed) throw new Error("SETTLEMENT_CONFLICT")

  let balances: { available_balance: number; container_withdrawable_earnings: number }
  try {
    balances = await applyCopyTradeSettlementCredits(admin, userId, mainCredit, liquidCredit)
  } catch (creditErr) {
    await admin.from("copy_trade_sessions").update({ settled_at: null }).eq("id", sessionId).eq("user_id", userId)
    throw creditErr instanceof Error ? creditErr : new Error(String(creditErr))
  }

  const { error: upErr } = await admin
    .from("copy_trade_sessions")
    .update({ status: "closed", closed_at: now })
    .eq("id", sessionId)
    .eq("user_id", userId)
  if (upErr) throw new Error(upErr.message)

  await recordFinancialEvent({
    userId,
    eventType: "copy_trade_session_settled",
    category: "trade",
    amount: roundUsd2(netToMain),
    feeAmount: roundUsd2(settlement.cancelFeeUsd + settlement.withdrawFeeUsd),
    balanceSource: "copy_trade_session_lock",
    balanceDestination: "available_balance+container_withdrawable_earnings",
    status: "completed",
    relatedTradeId: sessionId,
    actorType: financialActorType,
    actorId: userId,
    summary: `Copy-trade closed — net ${roundUsd2(netToMain)} USD after modeled fees (Nexus Main ${roundUsd2(mainCredit)}, container liquid ${roundUsd2(liquidCredit)}).`,
    metadata: {
      stakeUsd,
      floatingPnLUsd,
      coinImpactFraction,
      grossBeforeFeesUsd: settlement.grossBeforeFeesUsd,
      cancelFeeUsd: settlement.cancelFeeUsd,
      withdrawFeeUsd: settlement.withdrawFeeUsd,
      mainCreditUsd: mainCredit,
      liquidCreditUsd: liquidCredit,
    },
  })

  return {
    settlement: {
      stakeUsd,
      grossBeforeFeesUsd: settlement.grossBeforeFeesUsd,
      cancelFeeUsd: settlement.cancelFeeUsd,
      withdrawFeeUsd: settlement.withdrawFeeUsd,
      netToMainUsd: settlement.netToMainUsd,
      mainCreditUsd: mainCredit,
      liquidCreditUsd: liquidCredit,
    },
    balances,
  }
}
