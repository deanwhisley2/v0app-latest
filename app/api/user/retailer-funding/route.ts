import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getRetailFundingCustomerGate } from "@/lib/server/security-authz"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import {
  assertNoDuplicatePendingUserFunding,
  DuplicatePendingError,
} from "@/lib/server/funding-duplicate-guard"
import {
  attachProfileEmailsToRetailers,
  retailerSpendableLiquidity,
} from "@/lib/server/retailer-funding-helpers"
import { notifyUserFundingDecision } from "@/lib/server/approval-inbox-notify"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()
    const gate = await getRetailFundingCustomerGate(user.id, user.email)
    const level = gate.level
    const requestsRes = await admin
      .from("retailer_fund_requests")
      .select(
        "id,retailer_id,amount,tx_reference,status,note,appeal_note,fund_channel,mobile_network,created_at,reviewed_at,resolved_at,escalated_to_admin,payer_display_name,payer_phone,retailer_response_deadline_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
    if (requestsRes.error) return NextResponse.json({ error: requestsRes.error.message }, { status: 500 })

    /** Full desk directory only for designated Level-2 retailer credit sellers; buyers use GET /qualified-retailers. */
    const rawRetailers =
      level === 2 && gate.retailerCreditSeller
        ? (
            await admin
              .from("retailer_profiles")
              .select(
                "id,user_id,payment_numbers,credit_basin,under_review,under_review_reason,country_code,is_country_retailer,liquidity_status,updated_at"
              )
              .order("updated_at", { ascending: false })
          ).data ?? []
        : []
    const retailers = await attachProfileEmailsToRetailers(admin, rawRetailers)

    return NextResponse.json({
      userLevel: level,
      customerRetailFunding: gate.canUseRetailFundingCustomerFlow,
      retailers,
      requests: requestsRes.data ?? [],
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const gate = await getRetailFundingCustomerGate(user.id, user.email)
    if (!gate.canUseRetailFundingCustomerFlow) {
      return NextResponse.json(
        { error: "Retailer funding requests are limited to Level 1 and Level 2 accounts that are not designated retailer credit desks." },
        { status: 403 }
      )
    }
    const body = (await request.json().catch(() => ({}))) as {
      retailerId?: string
      amount?: number
      txReference?: string
      note?: string
      mobileNetwork?: string
      fundChannel?: "local_mobile" | "legacy_admin"
      fundingCountryCode?: string
      payerDisplayName?: string
      payerPhone?: string
    }
    const retailerId = typeof body.retailerId === "string" ? body.retailerId.trim() : ""
    const txReference = typeof body.txReference === "string" ? body.txReference.trim() : ""
    const amount = Number(body.amount ?? 0)
    const note = typeof body.note === "string" ? body.note.trim() : null
    const mobileNetwork = typeof body.mobileNetwork === "string" ? body.mobileNetwork.trim().slice(0, 48) : null
    const payerDisplayName =
      typeof body.payerDisplayName === "string" ? body.payerDisplayName.trim().slice(0, 120) || null : null
    const payerPhone = typeof body.payerPhone === "string" ? body.payerPhone.trim().slice(0, 32) || null : null
    const fundChannel = body.fundChannel === "legacy_admin" ? "legacy_admin" : "local_mobile"
    const countryUpdate =
      typeof body.fundingCountryCode === "string" ? body.fundingCountryCode.trim().toUpperCase().slice(0, 2) : ""

    if (!retailerId || !txReference || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "retailerId, amount, and txReference are required." }, { status: 400 })
    }
    if (fundChannel === "local_mobile" && (!payerDisplayName || !payerPhone)) {
      return NextResponse.json(
        { error: "payerDisplayName and payerPhone are required for local mobile funding." },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    if (countryUpdate.length === 2) {
      await admin.from("profiles").update({ funding_country_code: countryUpdate }).eq("id", user.id)
    }

    let retailerResponseDeadlineAt: string | null = null

    if (fundChannel === "local_mobile") {
      const { data: desk, error: de } = await admin
        .from("retailer_profiles")
        .select("id,user_id,is_country_retailer,country_code,under_review,liquidity_status,estimated_response_minutes")
        .eq("id", retailerId)
        .maybeSingle()

      type DeskRow = {
        user_id?: string
        is_country_retailer?: boolean
        under_review?: boolean
        liquidity_status?: string | null
        country_code?: string | null
        estimated_response_minutes?: number | null
      }
      const d = desk as DeskRow | null
      if (de || !d?.user_id) {
        return NextResponse.json({ error: "Retailer desk not found." }, { status: 400 })
      }
      if (!d.is_country_retailer || d.under_review || d.liquidity_status === "offline") {
        return NextResponse.json({ error: "This retailer is not available for local funding right now." }, {
          status: 400,
        })
      }

      const { data: prof } = await admin.from("profiles").select("funding_country_code").eq("id", user.id).maybeSingle()
      const userCountry =
        countryUpdate ||
        String(prof?.funding_country_code ?? "")
          .trim()
          .toUpperCase()
      const deskCountry = String(d.country_code ?? "").trim().toUpperCase()
      if (deskCountry.length !== 2) {
        return NextResponse.json({ error: "Retail desk is missing country configuration." }, { status: 400 })
      }
      if (deskCountry && userCountry.length === 2 && deskCountry !== userCountry) {
        return NextResponse.json({ error: "Country mismatch: pick a retailer in your registered country." }, {
          status: 400,
        })
      }

      const { spendable } = await retailerSpendableLiquidity(admin, d.user_id, retailerId)
      if (spendable < amount) {
        return NextResponse.json(
          {
            error:
              "This retailer cannot cover this amount anymore. Refresh the list or choose another retailer.",
          },
          { status: 409 },
        )
      }

      const minsRaw = Number(d.estimated_response_minutes ?? 60)
      const mins = Math.min(180, Math.max(1, Number.isFinite(minsRaw) ? minsRaw : 60))
      retailerResponseDeadlineAt = new Date(Date.now() + mins * 60_000).toISOString()
    }

    try {
      await assertNoDuplicatePendingUserFunding(admin, user.id, amount, fundChannel, mobileNetwork)
    } catch (err) {
      if (err instanceof DuplicatePendingError) {
        return NextResponse.json({ error: err.message, code: "DUPLICATE_PENDING" }, { status: 409 })
      }
      throw err
    }

    const { data, error } = await admin
      .from("retailer_fund_requests")
      .insert({
        user_id: user.id,
        retailer_id: retailerId,
        amount,
        tx_reference: txReference,
        note,
        status: "pending",
        fund_channel: fundChannel,
        mobile_network: mobileNetwork,
        payer_display_name: payerDisplayName,
        payer_phone: payerPhone,
        retailer_response_deadline_at: retailerResponseDeadlineAt,
      })
      .select(
        "id,retailer_id,amount,tx_reference,status,note,fund_channel,mobile_network,created_at,escalated_to_admin,retailer_response_deadline_at"
      )
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
      summary:
        fundChannel === "local_mobile"
          ? "Local mobile-money funding submitted; awaiting retailer verification."
          : "Retailer funding request submitted (legacy admin channel).",
      metadata: { retailerId, requestId: data.id, fundChannel },
    })
    await notifyUserFundingDecision(admin, {
      userId: user.id,
      headline: "Funding request submitted — pending review",
      relatedId: data.id as string,
    })
    return NextResponse.json({ ok: true, request: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as { requestId?: string; appealNote?: string }
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
    const appealNote = typeof body.appealNote === "string" ? body.appealNote.trim() : ""
    if (!requestId || !appealNote) {
      return NextResponse.json({ error: "requestId and appealNote are required." }, { status: 400 })
    }
    const admin = createAdminClient()
    const now = new Date().toISOString()
    const { error } = await admin
      .from("retailer_fund_requests")
      .update({
        appeal_note: appealNote,
        status: "appealed",
        escalated_to_admin: true,
        escalated_note: appealNote,
        escalation_at: now,
        updated_at: now,
      })
      .eq("id", requestId)
      .eq("user_id", user.id)
      .in("status", ["rejected", "under_review", "pending"])
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
      summary: "Funding appeal escalated for human admin review.",
      metadata: { appealNote, requestId },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
