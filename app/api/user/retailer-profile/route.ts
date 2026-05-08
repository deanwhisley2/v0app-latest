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
      .select("id,user_id,payment_numbers,credit_basin,under_review,under_review_reason,updated_at")
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
    const admin = createAdminClient()
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from("retailer_profiles")
      .upsert(
        { user_id: user.id, payment_numbers: paymentNumbers as unknown[], updated_at: now },
        { onConflict: "user_id" }
      )
      .select("id,user_id,payment_numbers,credit_basin,under_review,under_review_reason,updated_at")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, profile: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
