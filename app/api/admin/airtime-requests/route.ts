import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { recordFinancialEvent } from "@/lib/server/financial-events"

/**
 * Admin API for airtime requests management.
 * Level 5 admins can view, approve, decline, and mark airtime as completed.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * GET /api/admin/airtime-requests — List all airtime requests
 */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") ?? "pending"

    let q = admin
      .from("airtime_requests")
      .select(
        "id,user_id,source,amount_usd,amount_local,local_currency,network,phone_number,account_names,status,transaction_ref,created_at,reviewed_at,reviewed_by,completed_at,metadata"
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
  decision?: "approve" | "decline" | "complete"
  resolutionNote?: string
}

/**
 * PATCH /api/admin/airtime-requests — Approve, decline, or complete an airtime request
 */
export async function PATCH(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as PatchBody
    const requestId = body.requestId
    if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 })

    const admin = createAdminClient()

    // Fetch the request
    const { data: req, error: fetchErr } = await admin
      .from("airtime_requests")
      .select("id,user_id,amount_usd,amount_local,local_currency,network,phone_number,status")
      .eq("id", requestId)
      .maybeSingle()

    if (fetchErr) throw new Error(fetchErr.message)
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 })

    const userId = req.user_id as string
    const txRef = (req as Record<string, unknown>).transaction_ref as string ?? crypto.randomUUID()
    const now = new Date().toISOString()

    if (body.decision === "approve") {
      if (req.status !== "pending") {
        return NextResponse.json({ error: "Request is not pending" }, { status: 400 })
      }

      const { data: rpcRes, error: rpcErr } = await admin.rpc("approve_airtime_v1", {
        p_request_id: requestId,
        p_admin_id: actor.id,
      })

      if (rpcErr) throw new Error(rpcErr.message)

      await recordFinancialEvent({
        userId,
        eventType: "airtime_approved",
        category: "cashout",
        amount: Number(req.amount_usd ?? 0),
        feeAmount: 0,
        balanceSource: "airtime_withdrawable_earnings",
        balanceDestination: "external",
        status: "approved",
        transactionRef: txRef,
        actorType: "admin",
        actorId: actor.id,
        summary: `Airtime approved: ${Number(req.amount_local ?? 0)} ${req.local_currency} on ${req.network} (${req.phone_number})`,
        metadata: { requestId, approvedAt: now },
      })

      return NextResponse.json({
        ok: true,
        decision: "approve",
        requestId,
        status: "approved",
        phoneNumber: req.phone_number,
        amount: `${req.amount_local} ${req.local_currency}`,
        network: req.network,
      })
    }

    if (body.decision === "decline") {
      if (req.status !== "pending") {
        return NextResponse.json({ error: "Request is not pending" }, { status: 400 })
      }

      const { data: rpcRes, error: rpcErr } = await admin.rpc("decline_airtime_v1", {
        p_request_id: requestId,
        p_admin_id: actor.id,
        p_reason: body.resolutionNote ?? null,
      })

      if (rpcErr) throw new Error(rpcErr.message)

      await recordFinancialEvent({
        userId,
        eventType: "airtime_declined",
        category: "cashout",
        amount: Number(req.amount_usd ?? 0),
        feeAmount: 0,
        balanceSource: "airtime_withdrawable_earnings",
        balanceDestination: "container_withdrawable_earnings",
        status: "rejected",
        transactionRef: txRef,
        actorType: "admin",
        actorId: actor.id,
        summary: `Airtime declined: ${Number(req.amount_local ?? 0)} ${req.local_currency} — refunded to earnings.`,
        metadata: { requestId, reason: body.resolutionNote },
      })

      return NextResponse.json({
        ok: true,
        decision: "decline",
        requestId,
        status: "rejected",
        message: "Airtime request declined. Funds refunded to user's earnings balance.",
      })
    }

    if (body.decision === "complete") {
      if (req.status !== "approved") {
        return NextResponse.json({ error: "Request must be approved first" }, { status: 400 })
      }

      const { data: rpcRes, error: rpcErr } = await admin.rpc("complete_airtime_v1", {
        p_request_id: requestId,
        p_admin_id: actor.id,
      })

      if (rpcErr) throw new Error(rpcErr.message)

      await recordFinancialEvent({
        userId,
        eventType: "airtime_completed",
        category: "cashout",
        amount: Number(req.amount_usd ?? 0),
        feeAmount: 0,
        balanceSource: "airtime_withdrawable_earnings",
        balanceDestination: "external",
        status: "completed",
        transactionRef: txRef,
        actorType: "admin",
        actorId: actor.id,
        summary: `Airtime delivered: ${Number(req.amount_local ?? 0)} ${req.local_currency} to ${req.phone_number} (${req.network})`,
        metadata: { requestId, completedAt: now },
      })

      return NextResponse.json({
        ok: true,
        decision: "complete",
        requestId,
        status: "completed",
        message: "Airtime marked as delivered.",
      })
    }

    return NextResponse.json({ error: "decision must be approve, decline, or complete" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const code = msg.includes("Level 5") ? 403 : 500
    return NextResponse.json({ error: msg }, { status: code })
  }
}
