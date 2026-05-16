import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { notifyCustomerFundingDeclined } from "@/lib/server/l5-funding-notify"
import {
  finalizeRetailerLiquidityReservation,
  getUserRetailBalance,
  isFundingFxQuoteExpired,
  settlementUsdFromFundRequestRow,
  transferRetailCreditToCustomer,
} from "@/lib/server/retailer-funding-helpers"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level !== 2 && level !== 5) {
      return NextResponse.json({ error: "Retailer queue is for level 2 desks and level 5 supervision." }, { status: 403 })
    }
    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const targetRetailerUserId =
      level === 5 ? (searchParams.get("retailerUserId") ?? "").trim() || user.id : user.id
    const { data: desk } = await admin
      .from("retailer_profiles")
      .select("id,payment_numbers,registered_payee_names,country_code,whatsapp_number,contact_phone")
      .eq("user_id", targetRetailerUserId)
      .maybeSingle()
    if (!desk?.id) return NextResponse.json({ requests: [], desk: null })

    const { data, error } = await admin
      .from("retailer_fund_requests")
      .select(
        "id,user_id,amount,tx_reference,status,note,mobile_network,fund_channel,created_at,appeal_note,escalated_to_admin,payer_display_name,payer_phone,updated_at,retailer_response_deadline_at"
      )
      .eq("retailer_id", desk.id)
      .in("status", ["pending", "under_review", "appealed", "escalated"])
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ requests: data ?? [], desk })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level !== 2 && level !== 5) {
      return NextResponse.json({ error: "Retailer actions require level 2 desk or level 5 supervision." }, { status: 403 })
    }
    const body = (await request.json().catch(() => ({}))) as {
      requestId?: string
      action?: "approve" | "reject" | "review"
      retailerUserId?: string
    }
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
    if (!requestId || !body.action) {
      return NextResponse.json({ error: "requestId and action are required." }, { status: 400 })
    }
    const admin = createAdminClient()
    const targetRetailerUserId =
      level === 5 ? (typeof body.retailerUserId === "string" ? body.retailerUserId.trim() : "") || user.id : user.id
    const { data: desk } = await admin.from("retailer_profiles").select("id").eq("user_id", targetRetailerUserId).maybeSingle()
    if (!desk?.id) return NextResponse.json({ error: "No retailer profile." }, { status: 400 })

    const { data: row, error: fetchErr } = await admin
      .from("retailer_fund_requests")
      .select(
        "id,user_id,retailer_id,amount,amount_usd_locked,fx_quote_expires_at,tx_reference,status,fund_channel",
      )
      .eq("id", requestId)
      .eq("retailer_id", desk.id)
      .maybeSingle()
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: "Request not found." }, { status: 404 })
    if (
      row.status !== "pending" &&
      row.status !== "under_review" &&
      row.status !== "appealed" &&
      row.status !== "escalated"
    ) {
      return NextResponse.json({ error: "Request is not awaiting retailer action." }, { status: 400 })
    }
    const fundChannel = String(row.fund_channel ?? "legacy_admin")
    if (fundChannel !== "local_mobile") {
      return NextResponse.json({ error: "This request uses the legacy admin channel." }, { status: 400 })
    }

    const now = new Date().toISOString()
    const amt = settlementUsdFromFundRequestRow(row as { amount_usd_locked?: unknown; amount?: unknown })

    if (body.action === "review") {
      if (row.status === "under_review") {
        return NextResponse.json({ ok: true })
      }
      const { error: up } = await admin
        .from("retailer_fund_requests")
        .update({ status: "under_review", updated_at: now })
        .eq("id", requestId)
      if (up) return NextResponse.json({ error: up.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === "reject") {
      try {
        await finalizeRetailerLiquidityReservation(admin, requestId, "released", "retailer_rejected")
      } catch (relErr) {
        return NextResponse.json(
          { error: relErr instanceof Error ? relErr.message : "Could not release liquidity reservation." },
          { status: 500 },
        )
      }
      const { error: up } = await admin
        .from("retailer_fund_requests")
        .update({
          status: "rejected",
          retailer_approved_by: user.id,
          retailer_approved_at: now,
          updated_at: now,
        })
        .eq("id", requestId)
      if (up) return NextResponse.json({ error: up.message }, { status: 400 })
      await recordFinancialEvent({
        userId: row.user_id,
        eventType: "funding_request_rejected_by_retailer",
        category: "funding",
        amount: amt,
        status: "rejected",
        actorType: "retailer",
        actorId: user.id,
        transactionRef: row.tx_reference,
        relatedTradeId: requestId,
        summary: "Retailer rejected local mobile-money funding after review.",
        metadata: { retailerProfileId: desk.id, requestId },
      })
      await notifyCustomerFundingDeclined(admin, {
        userId: String(row.user_id),
        requestId,
        resolutionNote: null,
      })
      return NextResponse.json({ ok: true })
    }

    if (isFundingFxQuoteExpired(row as { fx_quote_expires_at?: string | null })) {
      return NextResponse.json(
        { error: "This funding quote has expired — ask the customer to submit a new request." },
        { status: 400 },
      )
    }

    const bal = await getUserRetailBalance(admin, user.id)
    if (bal < amt) {
      return NextResponse.json({ error: "Retail Balance is below this request; cannot approve." }, {
        status: 400,
      })
    }

    try {
      await transferRetailCreditToCustomer(admin, {
        retailerUserId: user.id,
        customerUserId: row.user_id,
        amount: amt,
        requestId,
      })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Transfer failed" }, { status: 400 })
    }

    const { error: up } = await admin
      .from("retailer_fund_requests")
      .update({
        status: "approved",
        retailer_approved_by: user.id,
        retailer_approved_at: now,
        reviewed_by: user.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", requestId)
    if (up) return NextResponse.json({ error: up.message }, { status: 400 })

    await recordFinancialEvent({
      userId: row.user_id,
      eventType: "funding_request_approved_retailer_credit",
      category: "funding",
      amount: amt,
      balanceSource: "retail_balance",
      balanceDestination: "nexus_main_available",
      status: "approved",
      actorType: "retailer",
      actorId: user.id,
      transactionRef: row.tx_reference,
      relatedTradeId: requestId,
      summary: "Retailer approved local funding; Nexus main balance credited from retailer liquidity.",
      metadata: { retailerProfileId: desk.id, requestId },
    })
    await recordFinancialEvent({
      userId: user.id,
      eventType: "retailer_liquidity_debited",
      category: "funding",
      amount: amt,
      balanceSource: "retail_balance",
      balanceDestination: "customer_funding_payout",
      status: "completed",
      actorType: "retailer",
      actorId: user.id,
      transactionRef: row.tx_reference,
      relatedTradeId: requestId,
      summary: "Retailer Retail Balance debited after customer funding approval (local mobile-money).",
      metadata: { customerId: row.user_id, requestId },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
