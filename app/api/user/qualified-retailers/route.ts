import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import { retailerSpendableLiquidity } from "@/lib/server/retailer-funding-helpers"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const level = await getTradingUserLevel(user.id)
    if (level !== 1) {
      return NextResponse.json({ error: "Only level 1 accounts use qualified retailer funding." }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const amount = Number(searchParams.get("amount") ?? 0)
    let country = (searchParams.get("country") ?? "").trim().toUpperCase()
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount query required and must be > 0." }, { status: 400 })
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

    const { data: rows, error } = await admin
      .from("retailer_profiles")
      .select(
        "id,user_id,payment_numbers,credit_basin,under_review,country_code,is_country_retailer,liquidity_status,whatsapp_number,contact_phone,registered_payee_names,estimated_response_minutes,last_activity_at,updated_at"
      )
      .eq("is_country_retailer", true)
      .eq("country_code", country)
      .eq("under_review", false)
      .neq("liquidity_status", "offline")
      .order("updated_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const qualified: Array<Record<string, unknown>> = []
    for (const row of rows ?? []) {
      const uid = row.user_id as string
      const rid = row.id as string
      const { spendable } = await retailerSpendableLiquidity(admin, uid, rid)
      if (spendable < amount) continue
      const st = String(row.liquidity_status ?? "")
      if (st === "active" || st === "busy" || st === "low_liquidity") {
        qualified.push({
          ...row,
          spendable_liquidity: spendable,
        })
      }
    }

    return NextResponse.json({
      country,
      amount,
      retailers: qualified,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
