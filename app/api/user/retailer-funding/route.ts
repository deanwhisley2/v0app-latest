import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import { recordFinancialEvent } from "@/lib/server/financial-events"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const admin = createAdminClient()
    const [retailersRes, requestsRes] = await Promise.all([
      admin
        .from("retailer_profiles")
        .select("id,user_id,payment_numbers,credit_basin,under_review,under_review_reason,updated_at")
        .order("updated_at", { ascending: false }),
      admin
        .from("retailer_fund_requests")
        .select("id,retailer_id,amount,tx_reference,status,note,appeal_note,created_at,reviewed_at,resolved_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ])
    if (retailersRes.error) return NextResponse.json({ error: retailersRes.error.message }, { status: 500 })
    if (requestsRes.error) return NextResponse.json({ error: requestsRes.error.message }, { status: 500 })
    return NextResponse.json({
      userLevel: await getTradingUserLevel(user.id),
      retailers: retailersRes.data ?? [],
      requests: requestsRes.data ?? [],
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const level = await getTradingUserLevel(user.id)
    if (level !== 1) {
      return NextResponse.json({ error: "Only level 1 users can submit retailer top-up requests." }, { status: 403 })
    }
    const body = (await request.json().catch(() => ({}))) as {
      retailerId?: string
      amount?: number
      txReference?: string
      note?: string
    }
    const retailerId = typeof body.retailerId === "string" ? body.retailerId.trim() : ""
    const txReference = typeof body.txReference === "string" ? body.txReference.trim() : ""
    const amount = Number(body.amount ?? 0)
    const note = typeof body.note === "string" ? body.note.trim() : null
    if (!retailerId || !txReference || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "retailerId, amount, and txReference are required." }, { status: 400 })
    }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("retailer_fund_requests")
      .insert({
        user_id: user.id,
        retailer_id: retailerId,
        amount,
        tx_reference: txReference,
        note,
        status: "pending",
      })
      .select("id,retailer_id,amount,tx_reference,status,note,created_at")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await recordFinancialEvent({
      userId: user.id,
      eventType: "funding_request_created",
      category: "funding",
      amount,
      balanceSource: "external_funding",
      balanceDestination: "nexus_main_pending",
      status: "pending",
      actorType: "user",
      actorId: user.id,
      transactionRef: txReference,
      summary: "Retailer funding request submitted and awaiting approval.",
      metadata: { retailerId, requestId: data.id },
    })
    return NextResponse.json({ ok: true, request: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = (await request.json().catch(() => ({}))) as { requestId?: string; appealNote?: string }
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
    const appealNote = typeof body.appealNote === "string" ? body.appealNote.trim() : ""
    if (!requestId || !appealNote) {
      return NextResponse.json({ error: "requestId and appealNote are required." }, { status: 400 })
    }
    const admin = createAdminClient()
    const { error } = await admin
      .from("retailer_fund_requests")
      .update({ appeal_note: appealNote, status: "appealed", updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("user_id", user.id)
      .in("status", ["rejected", "under_review"])
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await recordFinancialEvent({
      userId: user.id,
      eventType: "funding_request_appealed",
      category: "funding",
      amount: 0,
      status: "pending",
      actorType: "user",
      actorId: user.id,
      relatedTradeId: requestId,
      summary: "Funding request appeal submitted by user.",
      metadata: { appealNote, requestId },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
