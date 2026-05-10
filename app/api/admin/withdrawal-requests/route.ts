import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Level 5 liquidity admins: list pending withdrawal rows (service-backed queue). */
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
        "id,user_id,amount,currency_context,status,transaction_ref,created_at,reviewed_at,reviewed_by"
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
  decision?: "approve" | "reject"
}

/**
 * Approve: frozen funds leave pending (payout is external — ledger completes platform-side hold).
 * Reject: return frozen amount to Nexus Main available_balance.
 */
export async function PATCH(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as PatchBody
    const requestId = body.requestId
    if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 })
    if (body.decision !== "approve" && body.decision !== "reject") {
      return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: row, error: fetchErr } = await admin
      .from("withdrawal_requests")
      .select("id,user_id,amount,status,transaction_ref")
      .eq("id", requestId)
      .maybeSingle()

    if (fetchErr) throw new Error(fetchErr.message)
    if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })
    if (row.status !== "pending") {
      return NextResponse.json({ error: "Request is not pending" }, { status: 400 })
    }

    const amount = round2(Number(row.amount ?? 0))
    const userId = row.user_id as string
    const txRef = (row.transaction_ref as string) ?? crypto.randomUUID()

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
        { status: 409 }
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
          last_updated: new Date().toISOString(),
        })
        .eq("user_id", userId)
      if (upErr) throw new Error(upErr.message)

      const { error: rqErr } = await admin
        .from("withdrawal_requests")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: actor.id,
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
        summary: "Withdrawal rejected — frozen amount returned to Nexus Main.",
        metadata: { requestId },
      })

      return NextResponse.json({
        ok: true,
        decision: "reject",
        balances: { available_balance: nextAvailable, withdrawal_pending_balance: nextPending },
      })
    }

    // approve
    const { error: upErr } = await admin
      .from("user_balances")
      .update({
        withdrawal_pending_balance: nextPending,
        last_updated: new Date().toISOString(),
      })
      .eq("user_id", userId)
    if (upErr) throw new Error(upErr.message)

    const { error: rqErr } = await admin
      .from("withdrawal_requests")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor.id,
      })
      .eq("id", requestId)
    if (rqErr) throw new Error(rqErr.message)

    await recordFinancialEvent({
      userId,
      eventType: "withdrawal_approved_payout",
      category: "cashout",
      amount,
      feeAmount: 0,
      balanceSource: "withdrawal_pending_balance",
      balanceDestination: "external_payout",
      status: "completed",
      transactionRef: txRef,
      actorType: "admin",
      actorId: actor.id,
      summary: "Withdrawal approved — frozen funds released from platform pending (external settlement).",
      metadata: { requestId },
    })

    return NextResponse.json({
      ok: true,
      decision: "approve",
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
