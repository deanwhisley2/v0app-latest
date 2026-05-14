import type { SupabaseClient } from "@supabase/supabase-js"
import { officialLeaseEndDate } from "@/lib/fixed-trade-session-lease"
import type { FixPeriodMonths } from "@/lib/container-earnings-schedule"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import {
  computeFixedSessionPolicyGrossUsd,
  type FixedSessionEarnedRow,
} from "@/lib/server/fixed-trade-earnings-snapshot"
import {
  fixedLifecycleDailySumReconcilesTarget,
  parseFixedTradeLifecycleV2,
} from "@/lib/server/fixed-trade-lifecycle-v2"

const MATURITY_RELEASE_FEE_RATE = 0.01

export type FixedTradeMaturitySettlement = {
  principalReturnedUsd: number
  finalPolicyGrossUsd: number
  cumulativeReleasedUsd: number
  terminalGrossUsd: number
  terminalFeeUsd: number
  terminalLiquidNetUsd: number
  transactionRef?: string
}

export async function settleFixedTradeMaturityForUser(
  admin: SupabaseClient,
  params: {
    userId: string
    sessionId: string
  },
): Promise<{
  settlement: FixedTradeMaturitySettlement
  balances: { available_balance: number; current_stake: number; container_withdrawable_earnings: number }
  idempotent: boolean
}> {
  const { userId, sessionId } = params

  const { data: row, error: fErr } = await admin
    .from("fixed_trade_sessions")
    .select(
      "id,user_id,status,principal_amount,insurance_fee_amount,fix_period_months,seed_key,created_at,metadata,cumulative_earnings_released_usd,last_earnings_release_at,maturity_settled_at",
    )
    .eq("id", sessionId)
    .maybeSingle()
  if (fErr) throw new Error(fErr.message)
  if (!row) throw new Error("Session not found")
  if (row.user_id !== userId) throw new Error("Forbidden")

  const months = Number(row.fix_period_months) as FixPeriodMonths
  const leaseEnd = officialLeaseEndDate(String(row.created_at), months)
  const now = new Date()
  const maturityDone =
    (row as { maturity_settled_at?: string | null }).maturity_settled_at != null ||
    row.status === "matured" ||
    row.status === "completed" ||
    row.status === "archived"
  if (!maturityDone && now.getTime() < leaseEnd.getTime()) {
    throw new Error("LEASE_NOT_ENDED")
  }

  const earnedRow = row as FixedSessionEarnedRow
  const lc = parseFixedTradeLifecycleV2(earnedRow.metadata as Record<string, unknown> | null)
  if (!maturityDone && lc && !fixedLifecycleDailySumReconcilesTarget(lc)) {
    throw new Error("FIXED_LIFECYCLE_BUCKET_RECONCILE_FAILED")
  }

  const finalGross = roundUsd2(computeFixedSessionPolicyGrossUsd(earnedRow, leaseEnd))
  const cumulative = roundUsd2(Number((row as { cumulative_earnings_released_usd?: unknown }).cumulative_earnings_released_usd ?? 0))
  const remainderGross = roundUsd2(Math.max(0, finalGross - cumulative))

  const feePreview = roundUsd2(remainderGross * MATURITY_RELEASE_FEE_RATE)
  const liquidPreview = roundUsd2(remainderGross - feePreview)

  const { data: rpcRaw, error: rpcErr } = await admin.rpc("fixed_trade_finalize_maturity_v1", {
    p_session_id: sessionId,
    p_user_id: userId,
    p_final_gross_usd: finalGross,
    p_remainder_gross_usd: remainderGross,
  })
  if (rpcErr) throw new Error(rpcErr.message)

  const rpc = rpcRaw as {
    ok?: boolean
    idempotent?: boolean
    error?: string
    principal_returned_usd?: number | string
    terminal_gross_usd?: number | string
    terminal_fee_usd?: number | string
    terminal_liquid_net_usd?: number | string
    final_policy_gross_usd?: number | string
    available_balance?: number | string
    current_stake?: number | string
    container_withdrawable_earnings?: number | string
    transaction_ref?: string
  }

  if (!rpc?.ok) {
    throw new Error(typeof rpc.error === "string" ? rpc.error : "FIXED_MATURITY_RPC_FAILED")
  }

  const balances = {
    available_balance: roundUsd2(Number(rpc.available_balance ?? 0)),
    current_stake: roundUsd2(Number(rpc.current_stake ?? 0)),
    container_withdrawable_earnings: roundUsd2(Number(rpc.container_withdrawable_earnings ?? 0)),
  }

  const settlement: FixedTradeMaturitySettlement = rpc.idempotent
    ? {
        principalReturnedUsd: 0,
        finalPolicyGrossUsd: finalGross,
        cumulativeReleasedUsd: cumulative,
        terminalGrossUsd: 0,
        terminalFeeUsd: 0,
        terminalLiquidNetUsd: 0,
        transactionRef: typeof rpc.transaction_ref === "string" ? rpc.transaction_ref : undefined,
      }
    : {
        principalReturnedUsd: roundUsd2(Number(rpc.principal_returned_usd ?? row.principal_amount ?? 0)),
        finalPolicyGrossUsd: roundUsd2(Number(rpc.final_policy_gross_usd ?? finalGross)),
        cumulativeReleasedUsd: cumulative,
        terminalGrossUsd: roundUsd2(Number(rpc.terminal_gross_usd ?? remainderGross)),
        terminalFeeUsd: roundUsd2(Number(rpc.terminal_fee_usd ?? feePreview)),
        terminalLiquidNetUsd: roundUsd2(Number(rpc.terminal_liquid_net_usd ?? liquidPreview)),
        transactionRef: typeof rpc.transaction_ref === "string" ? rpc.transaction_ref : undefined,
      }

  return { settlement, balances, idempotent: rpc.idempotent === true }
}
