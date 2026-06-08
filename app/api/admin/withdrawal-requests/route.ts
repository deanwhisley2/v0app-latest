import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { creditMasterLiquidityFromApprovedWithdrawal } from "@/lib/server/admin-retail-pool"
import { notifyUserFundingDecision } from "@/lib/server/approval-inbox-notify"
import { notifyCustomerWithdrawalDeclined } from "@/lib/server/l5-withdrawal-notify"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  assertWithdrawalSettlementConserved,
  resolveWithdrawalSettlementFromRow,
} from "@/lib/server/withdrawal-processing-fee"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Level 5 liquidity admins: list withdrawal rows for the operations desk. */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") ?? "pending"

    let q = admin
      .from("withdrawal_requests")
      .select(
        "id,user_id,amount,processing_fee_amount,payout_amount,processing_fee_rate,currency_context,status,transaction_ref,created_at,reviewed_at,reviewed_by,resolution_note,payout_status,held_at,metadata"
      )
      .order("created_at", { ascending: false })
      .limit(200)

    if (status !== "all") {
      q = q.eq("status", status)
    }

    const { data, error } = await q

    if (error) throw new Error(error.message)
    return NextResponse.json({ requests: data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const code = msg.includes("Level 5") ? 403 : 500
    return NextResponse.json({ error: msg }, { status: code })
  }
}

type PatchBody = {
  requestId?: string
  decision?: "approve" | "reject" | "hold"
  resolutionNote?: string
}

const ACTIVE = ["pending", "under_review"]

async function appendMetadata(
  sb: SupabaseClient,
  requestId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data: cur } = await sb.from("withdrawal_requests").select("metadata").eq("id", requestId).maybeSingle()
  const base = (cur?.metadata as Record<string, unknown>) ?? {}
  const { error } = await sb.from("withdrawal_requests").update({ metadata: { ...base, ...patch } }).eq("id", requestId)
  if (error) throw new Error(error.message)
}

/**
 * Approve: clear user pending bucket + credit master operational pool (closed loop).
 * Reject: refund frozen amount to Nexus Main.
 * Hold: under_review for investigation.
 */
export async function PATCH(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as PatchBody
    const requestId = body.requestId
    const resolutionNote =
      typeof body.resolutionNote === "string" ? body.resolutionNote.trim().slice(0, 1200) || null : null
    if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 })
    if (body.decision !== "approve" && body.decision !== "reject" && body.decision !== "hold") {
      return NextResponse.json({ error: "decision must be approve, reject, or hold" }, { status: 400 })
    }
    if (body.decision === "reject" && !resolutionNote) {
      return NextResponse.json({ error: "Rejection requires a decision note" }, { status: 400 })
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
    if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })
    if (!ACTIVE.includes(String(row.status ?? ""))) {
      return NextResponse.json({ error: "Request is not pending or under review" }, { status: 400 })
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
    const txRef = (row.transaction_ref as string) ?? crypto.randomUUID()
    const now = new Date().toISOString()

    if (body.decision === "hold") {
      const { error: upRq } = await admin
        .from("withdrawal_requests")
        .update({
          status: "under_review",
          reviewed_by: actor.id,
          resolution_note: resolutionNote,
          held_at: now,
        })
        .eq("id", requestId)
      if (upRq) throw new Error(upRq.message)

      await recordFinancialEvent({
        userId,
        eventType: "withdrawal_operations_hold",
        category: "cashout",
        amount: grossAmount,
        feeAmount: processingFeeAmount,
        balanceSource: "withdrawal_pending_balance",
        balanceDestination: "withdrawal_pending_balance",
        status: "pending",
        transactionRef: txRef,
        actorType: "admin",
        actorId: actor.id,
        summary: resolutionNote
          ? `Withdrawal held for operations review. Note: ${resolutionNote.slice(0, 240)}`
          : "Withdrawal held for operations review (frozen balance unchanged).",
        metadata: {
          requestId,
          heldAt: now,
          settlement: {
            gross_usd: grossAmount,
            processing_fee_usd: processingFeeAmount,
            payout_usd: payoutAmount,
          },
        },
      })
      await notifyUserFundingDecision(admin, {
        userId,
        headline: "Withdrawal processing.",
        relatedId: requestId,
      })

      return NextResponse.json({ ok: true, decision: "hold" })
    }

    const { data: bal, error: balErr } = await admin
      .from("user_balances")
      .select("available_balance, withdrawal_pending_balance")
      .eq("user_id", userId)
      .maybeSingle()
    if (balErr) throw new Error(balErr.message)

    const pendingNow = round2(Number((bal as Record<string, unknown>)?.withdrawal_pending_balance ?? 0))
    if (pendingNow < grossAmount) {
      return NextResponse.json(
        { error: "Pending withdrawal balance lower than request — reconcile before acting." },
        { status: 409 },
      )
    }

    const nextPending = round2(pendingNow - grossAmount)

    if (body.decision === "reject") {
      const available = round2(Number(bal?.available_balance ?? 0))
      const nextAvailable = round2(available + grossAmount)

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
          reviewed_by: actor.id,
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
        actorId: actor.id,
        summary: resolutionNote
          ? `Withdrawal rejected — gross returned to Nexus Main. Note: ${resolutionNote.slice(0, 200)}`
          : "Withdrawal rejected — funds returned to Nexus Main.",
        metadata: {
          requestId,
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

      return NextResponse.json({
        ok: true,
        decision: "reject",
        balances: { available_balance: nextAvailable, withdrawal_pending_balance: nextPending },
      })
    }

    // approve → recycle net payout to master pool; processing fee retained in platform liquidity (gross − payout)
    const recycleTarget = await creditMasterLiquidityFromApprovedWithdrawal(admin, payoutAmount, actor.id)
    const payoutStatus = "recycled_pending_external"

    const { error: upErr } = await admin
      .from("user_balances")
      .update({
        withdrawal_pending_balance: nextPending,
        last_updated: now,
      })
      .eq("user_id", userId)
    if (upErr) throw new Error(upErr.message)

    const { error: rqErr } = await admin
      .from("withdrawal_requests")
      .update({
        status: "approved",
        reviewed_at: now,
        reviewed_by: actor.id,
        resolution_note: resolutionNote,
        payout_status: payoutStatus,
        held_at: null,
      })
      .eq("id", requestId)
    if (rqErr) throw new Error(rqErr.message)

    await appendMetadata(admin, requestId, {
      master_liquidity_recycle_target: recycleTarget,
      recycle_applied_usd: payoutAmount,
      processing_fee_retained_usd: processingFeeAmount,
      gross_usd: grossAmount,
      payout_usd: payoutAmount,
      recycle_at: now,
    })

    await recordFinancialEvent({
      userId,
      eventType: "withdrawal_approved_master_recycle",
      category: "cashout",
      amount: payoutAmount,
      feeAmount: processingFeeAmount,
      balanceSource: "withdrawal_pending_balance",
      balanceDestination: "master_operational_pool",
      status: "completed",
      transactionRef: txRef,
      actorType: "admin",
      actorId: actor.id,
      summary:
        recycleTarget === "pool"
          ? `Withdrawal approved — gross $${grossAmount.toFixed(2)}, fee $${processingFeeAmount.toFixed(2)}, payout $${payoutAmount.toFixed(2)} recycled to master pool; forward payout amount to handler.`
          : `Withdrawal approved — payout $${payoutAmount.toFixed(2)} credited to approver Nexus Main (fallback); gross $${grossAmount.toFixed(2)}, fee $${processingFeeAmount.toFixed(2)}.`,
      metadata: {
        requestId,
        recycleTarget,
        payoutStatus,
        settlement: {
          gross_usd: grossAmount,
          processing_fee_usd: processingFeeAmount,
          payout_usd: payoutAmount,
          fee_rate: settlement.processingFeeRate,
        },
      },
    })

    await notifyUserFundingDecision(admin, {
      userId,
      headline: settlement.legacyNoProcessingFee
        ? "Withdrawal completed."
        : "Withdrawal completed. Processing fee applied.",
      relatedId: requestId,
    })

    return NextResponse.json({
      ok: true,
      decision: "approve",
      recycleTarget,
      payoutStatus,
      settlement: {
        grossUsd: grossAmount,
        processingFeeUsd: processingFeeAmount,
        payoutUsd: payoutAmount,
        processingFeeRate: settlement.processingFeeRate,
        legacyNoProcessingFee: settlement.legacyNoProcessingFee,
      },
      balances: {
        available_balance: round2(Number(bal?.available_balance ?? 0)),
        withdrawal_pending_balance: nextPending,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const code = msg.includes("Level 5") ? 403 : 500
    return NextResponse.json({ error: msg }, { status: code })
  }
}
