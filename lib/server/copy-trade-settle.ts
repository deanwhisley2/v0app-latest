import type { SupabaseClient } from "@supabase/supabase-js"
import { estimateCopyForcePulloutUsd, scheduledCopyCycleSettlementUsd } from "@/lib/copy-trade-policy"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { applyCopyTradeSettlementCredits, splitCopySettlementMainVsLiquid } from "@/lib/server/copy-trade-balance-credit"
import { canonicalCopyTargetGrossUsd, parseCopyTradeLifecycle } from "@/lib/server/copy-trade-lifecycle"

export type CopyTradeSettlementPayload = {
  kind: "scheduled" | "force"
  stakeUsd: number
  grossBeforeFeesUsd: number
  cancelFeeUsd: number
  withdrawFeeUsd: number
  netToMainUsd: number
  mainCreditUsd: number
  liquidCreditUsd: number
  earningsExecutionFeeUsd?: number
}

function cycleElapsedMs(createdAtIso: string, nowMs: number): number {
  return Math.max(0, nowMs - new Date(createdAtIso).getTime())
}

export async function settleCopyTradeSessionForUser(
  admin: SupabaseClient,
  params: {
    userId: string
    sessionId: string
    floatingPnLUsd: number
    coinImpactFraction: number
    financialActorType?: "user" | "system"
    kind: "scheduled" | "force"
  },
): Promise<{ settlement: CopyTradeSettlementPayload; balances: { available_balance: number; container_withdrawable_earnings: number } }> {
  const { userId, sessionId, floatingPnLUsd, coinImpactFraction, financialActorType = "user", kind } = params

  const { data: row, error: fErr } = await admin
    .from("copy_trade_sessions")
    .select("id,user_id,stake_amount,status,metadata,created_at")
    .eq("id", sessionId)
    .maybeSingle()
  if (fErr) throw new Error(fErr.message)
  if (!row) throw new Error("Session not found")
  if (row.user_id !== userId) throw new Error("Forbidden")
  if (row.status !== "active") throw new Error("Session already closed")

  const stakeUsd = roundUsd2(Number(row.stake_amount ?? 0))
  const createdAt = row.created_at as string
  const md = (row.metadata ?? {}) as Record<string, unknown>
  const lifecycle = parseCopyTradeLifecycle(md)
  const targetGross =
    lifecycle?.targetGrossProfitUsd && lifecycle.targetGrossProfitUsd > 0
      ? roundUsd2(lifecycle.targetGrossProfitUsd)
      : canonicalCopyTargetGrossUsd(stakeUsd)

  let settlement: CopyTradeSettlementPayload
  let mainCredit: number
  let liquidCredit: number
  let feeForEvent: number

  if (kind === "scheduled") {
    const s = scheduledCopyCycleSettlementUsd(stakeUsd, targetGross)
    settlement = {
      kind: "scheduled",
      stakeUsd,
      grossBeforeFeesUsd: roundUsd2(stakeUsd + s.grossProfitUsd),
      cancelFeeUsd: 0,
      withdrawFeeUsd: s.earningsFeeUsd,
      netToMainUsd: roundUsd2(s.mainCreditUsd + s.liquidCreditUsd),
      mainCreditUsd: s.mainCreditUsd,
      liquidCreditUsd: s.liquidCreditUsd,
      earningsExecutionFeeUsd: s.earningsFeeUsd,
    }
    mainCredit = s.mainCreditUsd
    liquidCredit = s.liquidCreditUsd
    feeForEvent = s.earningsFeeUsd
  } else {
    const m = estimateCopyForcePulloutUsd({
      stakeUsd,
      floatingPnLUsd: Number.isFinite(floatingPnLUsd) ? floatingPnLUsd : 0,
      coinImpactFraction: Number.isFinite(coinImpactFraction) ? coinImpactFraction : 0,
    })
    const netToMain = m.netToMainUsd
    const split = splitCopySettlementMainVsLiquid(netToMain, stakeUsd)
    mainCredit = split.mainCredit
    liquidCredit = split.liquidCredit
    feeForEvent = roundUsd2(m.cancelFeeUsd + m.withdrawFeeUsd)
    settlement = {
      kind: "force",
      stakeUsd,
      grossBeforeFeesUsd: m.grossBeforeFeesUsd,
      cancelFeeUsd: m.cancelFeeUsd,
      withdrawFeeUsd: m.withdrawFeeUsd,
      netToMainUsd: netToMain,
      mainCreditUsd: mainCredit,
      liquidCreditUsd: liquidCredit,
    }
  }

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
    amount: roundUsd2(mainCredit + liquidCredit),
    feeAmount: feeForEvent,
    balanceSource: "copy_trade_session_lock",
    balanceDestination: "available_balance+container_withdrawable_earnings",
    status: "completed",
    relatedTradeId: sessionId,
    actorType: financialActorType,
    actorId: userId,
    summary:
      kind === "scheduled"
        ? `Copy-trade 24h cycle settled — stake ${roundUsd2(stakeUsd)} USD to Nexus Main; gross profit ${roundUsd2(targetGross)} USD, fee ${roundUsd2(feeForEvent)} USD; net ${roundUsd2(liquidCredit)} USD to container liquid.`
        : `Copy-trade force exit — net ${roundUsd2(settlement.netToMainUsd)} USD after modeled fees (Nexus Main ${roundUsd2(mainCredit)}, container liquid ${roundUsd2(liquidCredit)}).`,
    metadata: {
      settlementKind: kind,
      stakeUsd,
      floatingPnLUsd: kind === "force" ? floatingPnLUsd : undefined,
      coinImpactFraction: kind === "force" ? coinImpactFraction : undefined,
      targetGrossProfitUsd: kind === "scheduled" ? targetGross : undefined,
      mainCreditUsd: mainCredit,
      liquidCreditUsd: liquidCredit,
      cycleElapsedMs: cycleElapsedMs(createdAt, Date.now()),
    },
  })

  return { settlement, balances }
}
