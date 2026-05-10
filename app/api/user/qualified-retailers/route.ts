import { NextResponse } from "next/server"
import { corridorFiatForCountryIso2, localFiatUnitsToUsd } from "@/lib/currency-display"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getRetailFundingCustomerGate } from "@/lib/server/security-authz"
import {
  countOpenInboundRequestsForRetailer,
  retailerDeskSupportsNetwork,
  retailerSpendableLiquidity,
} from "@/lib/server/retailer-funding-helpers"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const gate = await getRetailFundingCustomerGate(user.id, user.email)
    if (!gate.canUseRetailFundingCustomerFlow) {
      return NextResponse.json(
        { error: "Qualified retailer funding is for Level 1 and Level 2 accounts that are not designated retailer credit desks." },
        { status: 403 }
      )
    }
    const { searchParams } = new URL(request.url)
    const amountRaw = Number(searchParams.get("amount") ?? 0)
    let country = (searchParams.get("country") ?? "").trim().toUpperCase()
    const mobileNetwork = (searchParams.get("network") ?? "").trim()
    if (!mobileNetwork) {
      return NextResponse.json({ error: "network query required (e.g. MTN, Airtel, MPesa, or Other)." }, {
        status: 400,
      })
    }
    const admin = createAdminClient()
    if (!country) {
      const { data: prof } = await admin
        .from("profiles")
        .select("funding_country_code")
        .eq("id", user.id)
        .maybeSingle()
      country = String(prof?.funding_country_code ?? "").trim().toUpperCase()
    }
    if (!country || country.length !== 2) {
      return NextResponse.json({ error: "Set your country in Add Funds (local) or save profile country first." }, {
        status: 400,
      })
    }

    let currency = (searchParams.get("currency") ?? "USD").trim().toUpperCase()
    /** Corridor fiat from ISO2 so typed amounts match MoMo denominations (UG→UGX), not wallet display USD. */
    const corridor = corridorFiatForCountryIso2(country)
    if (corridor) currency = corridor
    /** User's typed fiat → USD ledger units before comparing to retail_balance. */
    const amount = localFiatUnitsToUsd(amountRaw, currency)
    if (!Number.isFinite(amountRaw) || amountRaw <= 0 || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount query required and must be > 0." }, { status: 400 })
    }

    const customerCountry = country.trim().toUpperCase().slice(0, 2)

    const { data: rows, error } = await admin
      .from("retailer_profiles")
      .select(
        "id,user_id,payment_numbers,credit_basin,under_review,country_code,is_country_retailer,liquidity_status,whatsapp_number,contact_phone,registered_payee_names,estimated_response_minutes,last_activity_at,updated_at"
      )
      .eq("is_country_retailer", true)
      .eq("under_review", false)
      /** Explicit states only — avoids PostgREST `neq` dropping NULL legacy rows. */
      .in("liquidity_status", ["active", "busy", "low_liquidity"])
      .order("updated_at", { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    /** Skip desks drowning in open approvals (tunable). */
    const maxOpenTickets = 80
    const qualified: Array<Record<string, unknown>> = []
    for (const row of rows ?? []) {
      const deskCc = String(row.country_code ?? "")
        .trim()
        .toUpperCase()
        .slice(0, 2)
      /** Match same ISO2, or desks with no country set (legacy / ops); do not cross-match different ISO2s. */
      if (deskCc && deskCc !== customerCountry) continue

      if (!retailerDeskSupportsNetwork(row.payment_numbers, mobileNetwork)) continue

      const uid = row.user_id as string
      const rid = row.id as string
      const { spendable } = await retailerSpendableLiquidity(admin, uid, rid)
      if (spendable < amount) continue

      const openCount = await countOpenInboundRequestsForRetailer(admin, rid)
      if (openCount >= maxOpenTickets) continue

      const st = String(row.liquidity_status ?? "")
      if (st === "active" || st === "busy" || st === "low_liquidity") {
        qualified.push({
          ...row,
          spendable_liquidity: spendable,
          open_inbound_count: openCount,
        })
      }
    }

    const statusOrder: Record<string, number> = { active: 0, busy: 1, low_liquidity: 2 }
    qualified.sort((a, b) => {
      const sa = statusOrder[String(a.liquidity_status ?? "")] ?? 9
      const sb = statusOrder[String(b.liquidity_status ?? "")] ?? 9
      if (sa !== sb) return sa - sb
      const pa = Number(a.spendable_liquidity ?? 0)
      const pb = Number(b.spendable_liquidity ?? 0)
      return pb - pa
    })

    return NextResponse.json({
      country,
      amount,
      amount_input: amountRaw,
      currency,
      network: mobileNetwork,
      retailers: qualified,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
