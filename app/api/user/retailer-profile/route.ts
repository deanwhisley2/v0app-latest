import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("retailer_profiles")
      .select(
        "id,user_id,payment_numbers,credit_basin,under_review,under_review_reason,country_code,is_country_retailer,liquidity_status,whatsapp_number,contact_phone,registered_payee_names,estimated_response_minutes,last_activity_at,updated_at"
      )
      .eq("user_id", user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ level: await getTradingUserLevel(user.id), profile: data ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const level = await getTradingUserLevel(user.id)
    if (level !== 2) return NextResponse.json({ error: "Retailer profile is only for level 2 users." }, { status: 403 })
    const body = (await request.json().catch(() => ({}))) as {
      paymentNumbers?: Array<{ label?: string; value?: string }>
      countryCode?: string
      isCountryRetailer?: boolean
      liquidityStatus?: "active" | "busy" | "offline" | "low_liquidity"
      whatsappNumber?: string
      contactPhone?: string
      registeredPayeeNames?: string
    }
    const paymentNumbers = Array.isArray(body.paymentNumbers)
      ? body.paymentNumbers
          .map((p) => ({
            label: typeof p.label === "string" ? p.label.trim().slice(0, 32) : "",
            value: typeof p.value === "string" ? p.value.trim().slice(0, 120) : "",
          }))
          .filter((p) => p.value.length > 0)
      : []
    if (paymentNumbers.length === 0) {
      return NextResponse.json({ error: "At least one payment number is required." }, { status: 400 })
    }
    const cc = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase().slice(0, 2) : ""
    const liquidityAllowed = ["active", "busy", "offline", "low_liquidity"]
    const liqRaw = typeof body.liquidityStatus === "string" ? body.liquidityStatus.trim() : ""
    const liquidity_status = liquidityAllowed.includes(liqRaw) ? liqRaw : "offline"

    const admin = createAdminClient()
    const now = new Date().toISOString()

    const row: Record<string, unknown> = {
      user_id: user.id,
      payment_numbers: paymentNumbers as unknown[],
      updated_at: now,
      is_country_retailer: Boolean(body.isCountryRetailer),
      country_code: cc.length === 2 ? cc : null,
      liquidity_status,
      whatsapp_number: typeof body.whatsappNumber === "string" ? body.whatsappNumber.trim().slice(0, 32) || null : null,
      contact_phone: typeof body.contactPhone === "string" ? body.contactPhone.trim().slice(0, 32) || null : null,
      registered_payee_names:
        typeof body.registeredPayeeNames === "string" ? body.registeredPayeeNames.trim().slice(0, 280) || null : null,
      last_activity_at: liquidity_status !== "offline" ? now : null,
    }

    const { data, error } = await admin
      .from("retailer_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select(
        "id,user_id,payment_numbers,credit_basin,under_review,under_review_reason,country_code,is_country_retailer,liquidity_status,whatsapp_number,contact_phone,registered_payee_names,estimated_response_minutes,last_activity_at,updated_at"
      )
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, profile: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
