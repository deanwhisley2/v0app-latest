/**
 * One-off ops: reverse an mistaken L5 withdrawal approval (balances + request row).
 * Usage: npx tsx scripts/revert-withdrawal-approval.ts <withdrawal_request_id> [note]
 */
import { config } from "dotenv"
import { resolve } from "path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { debitAdminRetailPoolIfConfigured } from "../lib/server/admin-retail-pool"
import { recordFinancialEvent } from "../lib/server/financial-events"
import {
  assertWithdrawalSettlementConserved,
  resolveWithdrawalSettlementFromRow,
} from "../lib/server/withdrawal-processing-fee"

config({ path: resolve(process.cwd(), ".env.local") })

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

async function main() {
  const requestId = process.argv[2]?.trim()
  const note =
    process.argv[3]?.trim() ||
    "Mistaken approval reverted by operations — returned to pending queue."
  if (!requestId) {
    console.error("Usage: npx tsx scripts/revert-withdrawal-approval.ts <request_id> [note]")
    process.exit(1)
  }

  const admin = createAdminClient()
  const { data: row, error: fetchErr } = await admin
    .from("withdrawal_requests")
    .select(
      "id,user_id,amount,processing_fee_amount,payout_amount,processing_fee_rate,status,transaction_ref,metadata,reviewed_at,reviewed_by",
    )
    .eq("id", requestId)
    .maybeSingle()

  if (fetchErr) throw new Error(fetchErr.message)
  if (!row) throw new Error("Request not found")
  if (String(row.status) !== "approved") {
    throw new Error(`Request status is ${row.status}, not approved — nothing to revert`)
  }

  const settlement = resolveWithdrawalSettlementFromRow(
    row as {
      amount: number
      processing_fee_amount?: number | null
      payout_amount?: number | null
      processing_fee_rate?: number | null
    },
  )
  assertWithdrawalSettlementConserved(settlement)
  const grossAmount = settlement.grossAmount
  const payoutAmount = settlement.payoutAmount
  const processingFeeAmount = settlement.processingFeeAmount
  const userId = row.user_id as string
  const txRef = (row.transaction_ref as string) ?? requestId
  const meta = (row.metadata as Record<string, unknown>) ?? {}
  const recycleTarget = meta.master_liquidity_recycle_target === "approver" ? "approver" : "pool"
  const now = new Date().toISOString()

  const { data: bal, error: balErr } = await admin
    .from("user_balances")
    .select("available_balance, withdrawal_pending_balance")
    .eq("user_id", userId)
    .maybeSingle()
  if (balErr) throw new Error(balErr.message)

  const pendingNow = round2(Number((bal as Record<string, unknown>)?.withdrawal_pending_balance ?? 0))
  const nextPending = round2(pendingNow + grossAmount)

  // Undo master pool recycle (mirror of creditMasterLiquidityFromApprovedWithdrawal)
  if (recycleTarget === "pool") {
    await debitAdminRetailPoolIfConfigured(admin, payoutAmount)
  } else {
    const reviewedBy = (row as { reviewed_by?: string | null }).reviewed_by
    if (!reviewedBy) throw new Error("Missing reviewed_by for approver recycle target")
    const { data: approverBal } = await admin
      .from("user_balances")
      .select("available_balance")
      .eq("user_id", reviewedBy)
      .maybeSingle()
    const avail = Number(approverBal?.available_balance ?? 0)
    if (avail < payoutAmount) {
      throw new Error(`Approver pool insufficient to reverse recycle (${avail} < ${payoutAmount})`)
    }
    const { error: debErr } = await admin
      .from("user_balances")
      .update({ available_balance: round2(avail - payoutAmount), last_updated: now })
      .eq("user_id", reviewedBy)
    if (debErr) throw new Error(debErr.message)
  }

  const { error: upBalErr } = await admin
    .from("user_balances")
    .update({ withdrawal_pending_balance: nextPending, last_updated: now })
    .eq("user_id", userId)
  if (upBalErr) throw new Error(upBalErr.message)

  const { error: rqErr } = await admin
    .from("withdrawal_requests")
    .update({
      status: "pending",
      reviewed_at: null,
      reviewed_by: null,
      resolution_note: note,
      payout_status: "none",
      held_at: null,
      metadata: {
        ...meta,
        approval_reverted_at: now,
        approval_revert_note: note,
        prior_reviewed_at: row.reviewed_at ?? null,
      },
    })
    .eq("id", requestId)
  if (rqErr) throw new Error(rqErr.message)

  await recordFinancialEvent({
    userId,
    eventType: "withdrawal_approval_reverted",
    category: "cashout",
    amount: payoutAmount,
    feeAmount: processingFeeAmount,
    balanceSource: "master_operational_pool",
    balanceDestination: "withdrawal_pending_balance",
    status: "pending",
    transactionRef: txRef,
    actorType: "admin",
    actorId: null,
    summary: `Withdrawal approval reverted — gross $${grossAmount.toFixed(2)} returned to pending bucket; pool recycle undone ($${payoutAmount.toFixed(2)}).`,
    metadata: { requestId, recycleTarget, gross_usd: grossAmount, payout_usd: payoutAmount },
  })

  console.log(
    JSON.stringify(
      {
        ok: true,
        requestId,
        userId,
        grossAmount,
        payoutAmount,
        withdrawal_pending_balance: nextPending,
        recycleTarget,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
