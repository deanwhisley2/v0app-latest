import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireAdminUser } from "@/lib/server/security-authz"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireAdminUser(user)
    const admin = createAdminClient()
    const [requestsRes, retailersRes] = await Promise.all([
      admin
        .from("retailer_fund_requests")
        .select("id,user_id,retailer_id,amount,tx_reference,status,note,appeal_note,created_at,reviewed_at,resolved_at")
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("retailer_profiles")
        .select("id,user_id,credit_basin,payment_numbers,under_review,under_review_reason,updated_at")
        .order("updated_at", { ascending: false })
        .limit(100),
    ])
    if (requestsRes.error) return NextResponse.json({ error: requestsRes.error.message }, { status: 500 })
    if (retailersRes.error) return NextResponse.json({ error: retailersRes.error.message }, { status: 500 })
    return NextResponse.json({ requests: requestsRes.data ?? [], retailers: retailersRes.data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireAdminUser(user)
    const body = (await request.json().catch(() => ({}))) as {
      action?: "approve" | "reject" | "under_review" | "resolve" | "retailer_under_review"
      requestId?: string
      retailerId?: string
      reason?: string
    }
    const admin = createAdminClient()
    const now = new Date().toISOString()

    if (body.action === "retailer_under_review") {
      if (!body.retailerId) return NextResponse.json({ error: "retailerId is required" }, { status: 400 })
      const { error } = await admin
        .from("retailer_profiles")
        .update({
          under_review: true,
          under_review_reason: body.reason?.trim() || "Marked under review by admin.",
          updated_at: now,
        })
        .eq("id", body.retailerId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (!body.requestId || !body.action) {
      return NextResponse.json({ error: "requestId and action are required" }, { status: 400 })
    }

    const { data: reqRow, error: reqErr } = await admin
      .from("retailer_fund_requests")
      .select("id,retailer_id,amount")
      .eq("id", body.requestId)
      .maybeSingle()
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })
    if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 })

    const nextStatus =
      body.action === "approve"
        ? "approved"
        : body.action === "reject"
          ? "rejected"
          : body.action === "under_review"
            ? "under_review"
            : "resolved"

    const { error: updateErr } = await admin
      .from("retailer_fund_requests")
      .update({
        status: nextStatus,
        reviewed_by: user.id,
        reviewed_at: now,
        resolved_by: body.action === "resolve" ? user.id : null,
        resolved_at: body.action === "resolve" ? now : null,
        updated_at: now,
      })
      .eq("id", body.requestId)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    if (body.action === "approve" || body.action === "resolve") {
      const { data: retailer, error: retErr } = await admin
        .from("retailer_profiles")
        .select("credit_basin,under_review")
        .eq("id", reqRow.retailer_id)
        .maybeSingle()
      if (retErr) return NextResponse.json({ error: retErr.message }, { status: 500 })
      const currentBasin = Number(retailer?.credit_basin ?? 0)
      const amount = Number(reqRow.amount ?? 0)
      if (currentBasin < amount) {
        await admin
          .from("retailer_profiles")
          .update({
            under_review: true,
            under_review_reason: "Retailer basin insufficient for pending request.",
            updated_at: now,
          })
          .eq("id", reqRow.retailer_id)
      } else {
        await admin
          .from("retailer_profiles")
          .update({
            credit_basin: currentBasin - amount,
            under_review: false,
            under_review_reason: null,
            updated_at: now,
          })
          .eq("id", reqRow.retailer_id)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
