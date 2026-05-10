import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel, requireAdminUser } from "@/lib/server/security-authz"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { transferRetailCreditToCustomer } from "@/lib/server/retailer-funding-helpers"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireAdminUser(user)
    const admin = createAdminClient()
    const [requestsRes, retailersRes] = await Promise.all([
      admin
        .from("retailer_fund_requests")
        .select(
          "id,user_id,retailer_id,amount,tx_reference,status,note,appeal_note,fund_channel,mobile_network,created_at,reviewed_at,resolved_at,escalated_to_admin,escalation_at"
        )
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("retailer_profiles")
        .select(
          "id,user_id,credit_basin,payment_numbers,under_review,under_review_reason,country_code,is_country_retailer,liquidity_status,updated_at"
        )
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
      .select("id,user_id,retailer_id,amount,tx_reference,status,fund_channel,retailer_approved_at")
      .eq("id", body.requestId)
      .maybeSingle()
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })
    if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 })

    const customerId = (reqRow as { user_id: string }).user_id
    if (body.action === "approve" || body.action === "resolve") {
      const buyerLvl = await getTradingUserLevel(customerId)
      if (buyerLvl === 5) {
        return NextResponse.json(
          {
            error:
              "Liquidity admins (level 5) cannot be funded via retailer workflows; deny or escalate outside this ledger.",
          },
          { status: 403 }
        )
      }
    }

    const fundChannel = String((reqRow as { fund_channel?: string }).fund_channel ?? "legacy_admin")

    const nextStatus =
      body.action === "approve"
        ? "approved"
        : body.action === "reject"
          ? "rejected"
          : body.action === "under_review"
            ? "under_review"
            : "resolved"

    if (fundChannel === "local_mobile") {
      if (body.action === "approve") {
        if ((reqRow as { retailer_approved_at?: string }).retailer_approved_at) {
          return NextResponse.json({ error: "Already processed by retailer." }, { status: 400 })
        }
        const { data: rp } = await admin
          .from("retailer_profiles")
          .select("user_id")
          .eq("id", (reqRow as { retailer_id: string }).retailer_id)
          .maybeSingle()
        const retailerUserId = rp?.user_id as string | undefined
        if (!retailerUserId) return NextResponse.json({ error: "Retailer desk missing." }, { status: 400 })
        const amount = Number((reqRow as { amount?: number }).amount ?? 0)
        const custId = (reqRow as { user_id: string }).user_id

        try {
          await transferRetailCreditToCustomer(admin, {
            retailerUserId,
            customerUserId: custId,
            amount,
            requestId: body.requestId,
          })
        } catch (err) {
          return NextResponse.json({ error: err instanceof Error ? err.message : "Transfer failed." }, {
            status: 400,
          })
        }
      }

      const localPatch: Record<string, unknown> = {
        status: nextStatus,
        reviewed_by: user.id,
        reviewed_at: now,
        resolved_by: body.action === "resolve" ? user.id : null,
        resolved_at: body.action === "resolve" ? now : null,
        updated_at: now,
      }
      if (body.action === "approve") {
        localPatch.retailer_approved_by = user.id
        localPatch.retailer_approved_at = now
      }
      let statusQuery = admin.from("retailer_fund_requests").update(localPatch)
      statusQuery = statusQuery.eq("id", body.requestId)
      if (body.action === "approve" || body.action === "reject" || body.action === "resolve") {
        statusQuery = statusQuery.in("status", ["pending", "under_review", "appealed", "escalated"])
      }
      const { error: updateErr } = await statusQuery
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      await recordFinancialEvent({
        userId: custIdSafe(reqRow),
        eventType: `funding_request_admin_${nextStatus}`,
        category: "admin",
        amount: Number((reqRow as { amount?: number }).amount ?? 0),
        balanceSource: nextStatus === "approved" ? "retail_balance" : "nexus_main_pending",
        balanceDestination: nextStatus === "approved" ? "nexus_main_available" : "nexus_main_pending",
        status:
          nextStatus === "rejected"
            ? "rejected"
            : nextStatus === "under_review"
              ? "pending"
              : "approved",
        actorType: "admin",
        actorId: user.id,
        transactionRef: (reqRow as { tx_reference?: string }).tx_reference,
        summary: `Admin ${nextStatus} local mobile-money funding request (override / dispute desk).`,
        metadata: {
          requestId: (reqRow as { id: string }).id,
          retailerId: (reqRow as { retailer_id: string }).retailer_id,
          fundChannel,
        },
      })

      return NextResponse.json({ ok: true })
    }

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
        .eq("id", (reqRow as { retailer_id: string }).retailer_id)
        .maybeSingle()
      if (retErr) return NextResponse.json({ error: retErr.message }, { status: 500 })
      const currentBasin = Number(retailer?.credit_basin ?? 0)
      const amount = Number((reqRow as { amount?: number }).amount ?? 0)
      if (currentBasin < amount) {
        await admin
          .from("retailer_profiles")
          .update({
            under_review: true,
            under_review_reason: "Retailer basin insufficient for pending request.",
            updated_at: now,
          })
          .eq("id", (reqRow as { retailer_id: string }).retailer_id)
      } else {
        await admin
          .from("retailer_profiles")
          .update({
            credit_basin: currentBasin - amount,
            under_review: false,
            under_review_reason: null,
            updated_at: now,
          })
          .eq("id", (reqRow as { retailer_id: string }).retailer_id)
      }
    }

    await recordFinancialEvent({
      userId: custIdSafe(reqRow),
      eventType: `funding_request_${nextStatus}`,
      category: "admin",
      amount: Number((reqRow as { amount?: number }).amount ?? 0),
      balanceSource: nextStatus === "approved" ? "retailer_basin" : "nexus_main_pending",
      balanceDestination: nextStatus === "approved" ? "available_balance" : "nexus_main_pending",
      status:
        nextStatus === "rejected"
          ? "rejected"
          : nextStatus === "under_review"
            ? "pending"
            : "approved",
      actorType: "admin",
      actorId: user.id,
      transactionRef: (reqRow as { tx_reference?: string }).tx_reference,
      summary: `Admin ${nextStatus} retailer funding request (legacy basin workflow).`,
      metadata: {
        requestId: (reqRow as { id: string }).id,
        retailerId: (reqRow as { retailer_id: string }).retailer_id,
        fundChannel: "legacy_admin",
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

function custIdSafe(reqRow: unknown): string {
  return String((reqRow as { user_id?: string }).user_id ?? "")
}
