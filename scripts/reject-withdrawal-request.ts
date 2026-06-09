/**
 * Ops: reject a pending/under_review withdrawal (refund gross to Nexus Main).
 * Usage: npx tsx scripts/reject-withdrawal-request.ts <request_id> <resolution_note>
 */
import { config } from "dotenv"
import { resolve } from "path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { recordFinancialEvent } from "../lib/server/financial-events"
import { notifyCustomerWithdrawalDeclined } from "../lib/server/l5-withdrawal-notify"
import {
  assertWithdrawalSettlementConserved,
  resolveWithdrawalSettlementFromRow,
} from "../lib/server/withdrawal-processing-fee"
import { recordWithdrawalRejected } from "../lib/server/withdrawal-rejection-cooldown"

config({ path: resolve(process.cwd(), ".env.local") })

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

async function main() {
  const requestId = process.argv[2]?.trim()
  const resolutionNote = process.argv[3]?.trim()
  if (!requestId || !resolutionNote) {
    console.error("Usage: npx tsx scripts/reject-withdrawal-request.ts <request_id> <resolution_note>")
    process.exit(1)
  }

  const admin = createAdminClient()
  const { data: row, error: fetchErr } = await admin
    .from("withdrawal_requests")
    .select(
      "id,user_id,amount,processing_fee_amount,payout_amount,processing_fee_rate,status,transaction_ref,metadata",
    )
    .eq("id", requestId)
    .maybeSingle()

  if (fetchErr) throw new Error(fetchErr.message)
  if (!row) throw new Error("Request not found")
  const status = String(row.status ?? "")
  if (status !== "pending" && status !== "under_review") {
    throw new Error(`Request status is ${status} — must be pending or under_review`)
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
  const processingFeeAmount = settlement.processingFeeAmount
  const userId = row.user_id as string
  const txRef = (row.transaction_ref as string) ?? requestId
  const now = new Date().toISOString()

  const { data: bal, error: balErr } = await admin
    .from("user_balances")
    .select("available_balance, withdrawal_pending_balance")
    .eq("user_id", userId)
    .maybeSingle()
  if (balErr) throw new Error(balErr.message)

  const pendingNow = round2(Number((bal as Record<string, unknown>)?.withdrawal_pending_balance ?? 0))
  if (pendingNow < grossAmount) {
    throw new Error(`Pending withdrawal balance ${pendingNow} < gross ${grossAmount}`)
  }

  const available = round2(Number(bal?.available_balance ?? 0))
  const nextAvailable = round2(available + grossAmount)
  const nextPending = round2(pendingNow - grossAmount)

  const { error: upErr } = await admin
    .from("user_balances")
    .update({
      available_balance: nextAvailable,
      withdrawal_pending_balance: nextPending,
      last_updated: now,
    })
    .eq("user_id", userId)
  if (upErr) throw new Error(upErr.message)

  const { error: rqErr } = await admin
    .from("withdrawal_requests")
    .update({
      status: "rejected",
      reviewed_at: now,
      reviewed_by: null,
      resolution_note: resolutionNote,
      payout_status: "none",
      held_at: null,
    })
    .eq("id", requestId)
  if (rqErr) throw new Error(rqErr.message)

  await recordFinancialEvent({
    userId,
    eventType: "withdrawal_rejected_refund",
    category: "cashout",
    amount: grossAmount,
    feeAmount: 0,
    balanceSource: "withdrawal_pending_balance",
    balanceDestination: "available_balance",
    status: "completed",
    transactionRef: txRef,
    actorType: "admin",
    actorId: null,
    summary: `Withdrawal rejected — gross returned to Nexus Main. Note: ${resolutionNote.slice(0, 200)}`,
    metadata: {
      requestId,
      ops_script: true,
      settlement: {
        gross_usd: grossAmount,
        processing_fee_usd: 0,
        payout_usd: 0,
      },
    },
  })

  await notifyCustomerWithdrawalDeclined(admin, {
    userId,
    requestId,
    resolutionNote,
    amountUsd: grossAmount,
  })

  const rejectionCooldown = await recordWithdrawalRejected(admin, userId)

  console.log(
    JSON.stringify(
      {
        ok: true,
        requestId,
        userId,
        grossAmount,
        available_balance: nextAvailable,
        withdrawal_pending_balance: nextPending,
        resolutionNote,
        rejectionCooldown,
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
