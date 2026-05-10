import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { creditMasterLiquidityFromApprovedWithdrawal } from "@/lib/server/admin-retail-pool"
import { notifyUserFundingDecision } from "@/lib/server/approval-inbox-notify"
import type { SupabaseClient } from "@supabase/supabase-js"

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
        "id,user_id,amount,currency_context,status,transaction_ref,created_at,reviewed_at,reviewed_by,resolution_note,payout_status,held_at,metadata"
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

    const admin = createAdminClient()
    const { data: row, error: fetchErr } = await admin
      .from("withdrawal_requests")
      .select("id,user_id,amount,status,transaction_ref")
      .eq("id", requestId)
      .maybeSingle()

    if (fetchErr) throw new Error(fetchErr.message)
    if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })
    if (!ACTIVE.includes(String(row.status ?? ""))) {
      return NextResponse.json({ error: "Request is not pending or under review" }, { status: 400 })
    }

    const amount = round2(Number(row.amount ?? 0))
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
        amount,
        feeAmount: 0,
        balanceSource: "withdrawal_pending_balance",
        balanceDestination: "withdrawal_pending_balance",
        status: "pending",
        transactionRef: txRef,
        actorType: "admin",
        actorId: actor.id,
        summary: resolutionNote
          ? `Withdrawal held for operations review. Note: ${resolutionNote.slice(0, 240)}`
          : "Withdrawal held for operations review (frozen balance unchanged).",
        metadata: { requestId, heldAt: now },
      })
      await notifyUserFundingDecision(admin, {
        userId,
        headline: "Withdrawal held for review — funds remain frozen pending a decision.",
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
    if (pendingNow < amount) {
      return NextResponse.json(
        { error: "Pending withdrawal balance lower than request — reconcile before acting." },
        { status: 409 },
      )
    }

    const nextPending = round2(pendingNow - amount)

    if (body.decision === "reject") {
      const available = round2(Number(bal?.available_balance ?? 0))
      const nextAvailable = round2(available + amount)

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
        amount,
        feeAmount: 0,
        balanceSource: "withdrawal_pending_balance",
        balanceDestination: "available_balance",
        status: "completed",
        transactionRef: txRef,
        actorType: "admin",
        actorId: actor.id,
        summary: resolutionNote
          ? `Withdrawal rejected — frozen amount returned to Nexus Main. Note: ${resolutionNote.slice(0, 200)}`
          : "Withdrawal rejected — frozen amount returned to Nexus Main.",
        metadata: { requestId },
      })

      await notifyUserFundingDecision(admin, {
        userId,
        headline: resolutionNote
          ? `Withdrawal rejected — funds returned to Nexus Main. ${resolutionNote.slice(0, 90)}`
          : "Withdrawal rejected — funds returned to your Nexus Main Account.",
        relatedId: requestId,
      })

      return NextResponse.json({
        ok: true,
        decision: "reject",
        balances: { available_balance: nextAvailable, withdrawal_pending_balance: nextPending },
      })
    }

    // approve → recycle liquidity into master operational account, then external payout is manual/off-platform
    const recycleTarget = await creditMasterLiquidityFromApprovedWithdrawal(admin, amount, actor.id)
    if (recycleTarget === "none") {
      return NextResponse.json(
        {
          error:
            "Withdrawal not approved: treasury recycle is not configured. Set NEXUS_ADMIN_RETAIL_POOL_USER_ID (pool user credit requires a user_balances row — now auto-created on recycle) or NEXUS_WITHDRAWAL_RECYCLE_TO_APPROVER_WITHOUT_POOL=1. Pending withdrawal balance unchanged.",
        },
        { status: 409 },
      )
    }
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
      recycle_applied_usd: amount,
      recycle_at: now,
    })

    await recordFinancialEvent({
      userId,
      eventType: "withdrawal_approved_master_recycle",
      category: "cashout",
      amount,
      feeAmount: 0,
      balanceSource: "withdrawal_pending_balance",
      balanceDestination: "master_operational_pool",
      status: "completed",
      transactionRef: txRef,
      actorType: "admin",
      actorId: actor.id,
      summary:
        recycleTarget === "pool"
          ? `Withdrawal approved — ${amount.toFixed(2)} USD recycled to master operational pool (frozen bucket cleared); complete external payout off-platform.`
          : `Withdrawal approved — ${amount.toFixed(2)} USD credited to approving operator Nexus Main (fallback recycle); configure NEXUS_ADMIN_RETAIL_POOL_USER_ID for pooled treasury.`,
      metadata: { requestId, recycleTarget, payoutStatus },
    })

    await notifyUserFundingDecision(admin, {
      userId,
      headline:
        "Withdrawal approved internally — payout will complete through your payout channel once processed.",
      relatedId: requestId,
    })

    return NextResponse.json({
      ok: true,
      decision: "approve",
      recycleTarget,
      payoutStatus,
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
