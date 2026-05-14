import type { SupabaseClient } from "@supabase/supabase-js"
import { estimateCopyForcePulloutUsd, scheduledCopyCycleSettlementUsd } from "@/lib/copy-trade-policy"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { splitCopySettlementMainVsLiquid } from "@/lib/server/copy-trade-balance-credit"
import {
  canonicalCopyTargetGrossUsd,
  copyLifecycleBucketSumReconcilesTarget,
  parseCopyTradeLifecycle,
} from "@/lib/server/copy-trade-lifecycle"

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
  const md = (row.metadata ?? {}) as Record<string, unknown>
  const lifecycle = parseCopyTradeLifecycle(md)
  const targetGross =
    lifecycle?.targetGrossProfitUsd && lifecycle.targetGrossProfitUsd > 0
      ? roundUsd2(lifecycle.targetGrossProfitUsd)
      : canonicalCopyTargetGrossUsd(stakeUsd)

  let settlement: CopyTradeSettlementPayload
  let mainCredit: number
  let liquidCredit: number
  let auditPrincipalGross: number
  let auditPrincipalFee: number
  let auditEarningsGross: number
  let auditEarningsFee: number

  if (kind === "scheduled") {
    if (lifecycle && !copyLifecycleBucketSumReconcilesTarget(lifecycle)) {
      throw new Error("COPY_LIFECYCLE_BUCKET_RECONCILE_FAILED")
    }
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
    auditPrincipalGross = stakeUsd
    auditPrincipalFee = 0
    auditEarningsGross = s.grossProfitUsd
    auditEarningsFee = s.earningsFeeUsd
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
    auditPrincipalGross = roundUsd2(mainCredit + m.cancelFeeUsd)
    auditPrincipalFee = m.cancelFeeUsd
    auditEarningsGross = roundUsd2(liquidCredit + m.withdrawFeeUsd)
    auditEarningsFee = m.withdrawFeeUsd
  }

  const finalStatus = kind === "scheduled" ? "settled" : "force_closed"

  const { data: rpcRaw, error: rpcErr } = await admin.rpc("copy_trade_finalize_settlement_v1", {
    p_session_id: sessionId,
    p_user_id: userId,
    p_main_credit: mainCredit,
    p_liquid_credit: liquidCredit,
    p_final_status: finalStatus,
    p_audit_principal_gross_usd: auditPrincipalGross,
    p_audit_principal_fee_usd: auditPrincipalFee,
    p_audit_earnings_gross_usd: auditEarningsGross,
    p_audit_earnings_fee_usd: auditEarningsFee,
    p_actor_type: financialActorType,
  })
  if (rpcErr) throw new Error(rpcErr.message)

  const rpc = rpcRaw as {
    ok?: boolean
    idempotent?: boolean
    error?: string
    available_balance?: number | string
    container_withdrawable_earnings?: number | string
  }
  if (!rpc?.ok) {
    throw new Error(typeof rpc?.error === "string" ? rpc.error : "COPY_SETTLEMENT_RPC_FAILED")
  }

  const balances = {
    available_balance: roundUsd2(Number(rpc.available_balance ?? 0)),
    container_withdrawable_earnings: roundUsd2(Number(rpc.container_withdrawable_earnings ?? 0)),
  }

  return { settlement, balances }
}
