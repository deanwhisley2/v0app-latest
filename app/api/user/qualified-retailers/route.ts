import { NextResponse } from "next/server"
import { corridorFiatForCountryIso2, localFiatUnitsToUsd } from "@/lib/currency-display"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getRetailFundingCustomerGate } from "@/lib/server/security-authz"
import {
  collectQualifiedRetailDesks,
  fetchOfficialCorridorRoute,
  normalizeCorridorNetworkToken,
} from "@/lib/server/retailer-qualification"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const gate = await getRetailFundingCustomerGate(user.id, user.email)
    if (!gate.canUseRetailFundingCustomerFlow) {
      return NextResponse.json(
        {
          error:
            "Qualified retailer funding is for Level 1 and Level 2 accounts that are not designated retailer credit desks.",
        },
        { status: 403 },
      )
    }
    const { searchParams } = new URL(request.url)
    const amountRaw = Number(searchParams.get("amount") ?? 0)
    let country = (searchParams.get("country") ?? "").trim().toUpperCase()
    const mobileNetwork = (searchParams.get("network") ?? "").trim()
    if (!mobileNetwork) {
      return NextResponse.json(
        { error: "network query required (e.g. MTN, Airtel, MPesa, or Other)." },
        { status: 400 },
      )
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
      return NextResponse.json(
        { error: "Set your country in Add Funds (local) or save profile country first." },
        { status: 400 },
      )
    }

    let currency = (searchParams.get("currency") ?? "USD").trim().toUpperCase()
    const corridor = corridorFiatForCountryIso2(country)
    if (corridor) currency = corridor
    const amount = localFiatUnitsToUsd(amountRaw, currency)
    if (!Number.isFinite(amountRaw) || amountRaw <= 0 || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount query required and must be > 0." }, { status: 400 })
    }

    const customerCountry = country.trim().toUpperCase().slice(0, 2)

    const qualified = await collectQualifiedRetailDesks(admin, {
      customerCountry,
      mobileNetwork,
      amountUsd: amount,
      customerUserId: user.id,
    })

    let official_fallback = null as null | Record<string, unknown>
    if (!qualified.length) {
      const route = await fetchOfficialCorridorRoute(admin, {
        customerCountry,
        mobileNetwork,
        amountUsd: amount,
      })
      if (route) {
        official_fallback = {
          id: route.id,
          country_code: route.country_code,
          network_token: normalizeCorridorNetworkToken(route.network_token),
          payee_display_name: route.payee_display_name,
          payment_numbers: route.payment_numbers,
          whatsapp_number: route.whatsapp_number,
          contact_phone: route.contact_phone,
          source: "official_company_corridor",
          notice:
            "No qualifying retailer desk was available for this corridor. Pay only the official company numbers below. Level 5 operations will verify your receipt — this is not automatic approval.",
        }
      }
    }

    return NextResponse.json({
      country,
      amount,
      amount_input: amountRaw,
      currency,
      network: mobileNetwork,
      retailers: qualified,
      official_fallback,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
