import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"

const PAYMENT_NUMBERS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function normalizePaymentNumbersForCompare(rows: unknown): string {
  const arr = Array.isArray(rows) ? rows : []
  const cleaned = arr
    .map((p: { label?: string; value?: string }) => ({
      label: String(p?.label ?? "").trim(),
      value: String(p?.value ?? "").trim(),
    }))
    .filter((p) => p.value.length > 0)
    .sort((a, b) => a.value.localeCompare(b.value) || a.label.localeCompare(b.label))
  return JSON.stringify(cleaned)
}

function paymentNumbersCooldownMeta(updatedAtIso: string | null): {
  canEditPaymentNumbers: boolean
  nextEligibleAt: string | null
} {
  if (!updatedAtIso) return { canEditPaymentNumbers: true, nextEligibleAt: null }
  const last = new Date(updatedAtIso).getTime()
  if (Number.isNaN(last)) return { canEditPaymentNumbers: true, nextEligibleAt: null }
  const eligibleAt = last + PAYMENT_NUMBERS_COOLDOWN_MS
  if (Date.now() >= eligibleAt) return { canEditPaymentNumbers: true, nextEligibleAt: null }
  return { canEditPaymentNumbers: false, nextEligibleAt: new Date(eligibleAt).toISOString() }
}

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("retailer_profiles")
      .select(
        "id,user_id,payment_numbers,credit_basin,under_review,under_review_reason,country_code,is_country_retailer,liquidity_status,whatsapp_number,contact_phone,registered_payee_names,estimated_response_minutes,last_activity_at,updated_at,payment_numbers_updated_at",
      )
      .eq("user_id", user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const profile = data ?? null
    const nums = normalizePaymentNumbersForCompare(profile?.payment_numbers)
    const hasNumbers = nums !== "[]"
    const cd = paymentNumbersCooldownMeta(
      (profile as { payment_numbers_updated_at?: string | null } | null)?.payment_numbers_updated_at ?? null,
    )
    return NextResponse.json({
      level: await getTradingUserLevel(user.id),
      profile,
      deskRegistrationComplete: hasNumbers,
      paymentNumbersCooldown: cd,
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
    const level = await getTradingUserLevel(user.id)
    if (level !== 2 && level !== 5) {
      return NextResponse.json({ error: "Retailer profile is only for level 2 desks and level 5 supervision." }, { status: 403 })
    }
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
    if (Boolean(body.isCountryRetailer) && cc.length !== 2) {
      return NextResponse.json(
        { error: "Set a 2-letter country (e.g. UG) when offering in-country mobile-money desks, or turn off that option." },
        { status: 400 },
      )
    }
    const liquidityAllowed = ["active", "busy", "offline", "low_liquidity"]
    const liqRaw = typeof body.liquidityStatus === "string" ? body.liquidityStatus.trim() : ""
    const liquidity_status = liquidityAllowed.includes(liqRaw) ? liqRaw : "offline"

    const admin = createAdminClient()
    const now = new Date().toISOString()

    const { data: existing } = await admin
      .from("retailer_profiles")
      .select("payment_numbers,payment_numbers_updated_at")
      .eq("user_id", user.id)
      .maybeSingle()

    const incomingSig = normalizePaymentNumbersForCompare(paymentNumbers)
    const existingSig = normalizePaymentNumbersForCompare(existing?.payment_numbers)
    const paymentNumbersChanged = incomingSig !== existingSig

    if (existing && existingSig !== "[]" && paymentNumbersChanged) {
      const raw =
        (existing as { payment_numbers_updated_at?: string | null }).payment_numbers_updated_at ?? null
      const { canEditPaymentNumbers, nextEligibleAt } = paymentNumbersCooldownMeta(raw)
      if (!canEditPaymentNumbers) {
        return NextResponse.json(
          {
            error:
              "MoMo / payment lines can only be changed once every 7 days. Contact support if you need an urgent update.",
            code: "PAYMENT_NUMBERS_COOLDOWN",
            nextEligibleAt,
          },
          { status: 429 },
        )
      }
    }

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

    if (paymentNumbersChanged) {
      row.payment_numbers_updated_at = now
    } else if (existing) {
      row.payment_numbers_updated_at =
        (existing as { payment_numbers_updated_at?: string | null }).payment_numbers_updated_at ?? null
    }

    const { data, error } = await admin
      .from("retailer_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select(
        "id,user_id,payment_numbers,credit_basin,under_review,under_review_reason,country_code,is_country_retailer,liquidity_status,whatsapp_number,contact_phone,registered_payee_names,estimated_response_minutes,last_activity_at,updated_at,payment_numbers_updated_at",
      )
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, profile: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
