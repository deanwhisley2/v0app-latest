import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import {
  attachProfileEmailsToRetailers,
  getUserRetailBalance,
  retailerSpendableLiquidity,
} from "@/lib/server/retailer-funding-helpers"

const LOW_FLOAT_USD = 75

function deskStatusLabel(liquidity: string, frozen: boolean, disabled: boolean): string {
  if (disabled || liquidity === "suspended") return "Suspended"
  if (liquidity === "blocked") return "Blocked"
  if (liquidity === "frozen" || frozen) return "Frozen"
  if (liquidity === "active") return "Active"
  if (liquidity === "busy") return "Active"
  if (liquidity === "low_liquidity") return "Active"
  if (liquidity === "offline") return "Offline"
  return liquidity || "Unknown"
}

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get("q") ?? "").trim().toLowerCase()
    const admin = createAdminClient()

    const { data: rows, error } = await admin
      .from("retailer_profiles")
      .select(
        "id,user_id,payment_numbers,credit_basin,under_review,under_review_reason,country_code,is_country_retailer,liquidity_status,whatsapp_number,contact_phone,registered_payee_names,last_activity_at,updated_at",
      )
      .eq("is_country_retailer", true)
      .order("updated_at", { ascending: false })
      .limit(250)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const enriched = await attachProfileEmailsToRetailers(admin, rows ?? [])
    const userIds = enriched.map((r) => String((r as { user_id: string }).user_id))
    const { data: profs } = await admin
      .from("profiles")
      .select("id,operational_freeze_at,account_disabled_at,funding_country_code")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"])

    const profMap = new Map((profs ?? []).map((p) => [String(p.id), p]))

    const retailers = []
    for (const row of enriched) {
      const uid = String((row as { user_id: string }).user_id)
      const prof = profMap.get(uid)
      const email = String((row as { email?: string }).email ?? "").toLowerCase()
      if (q && !email.includes(q) && !uid.includes(q) && !String(row.id).includes(q)) continue

      const rid = String((row as { id: string }).id)
      const retailBal = await getUserRetailBalance(admin, uid)
      const { spendable } = await retailerSpendableLiquidity(admin, uid, rid)
      const liquidity = String((row as { liquidity_status?: string }).liquidity_status ?? "offline")
      const frozen = Boolean(prof?.operational_freeze_at)
      const disabled = Boolean(prof?.account_disabled_at)
      const lowFloat = spendable < LOW_FLOAT_USD

      retailers.push({
        id: rid,
        userId: uid,
        email: (row as { email?: string }).email ?? null,
        countryCode: row.country_code,
        liquidityStatus: liquidity,
        displayStatus: deskStatusLabel(liquidity, frozen, disabled),
        retailBalanceUsd: retailBal,
        spendableLiquidityUsd: spendable,
        creditBasinUsd: Number(row.credit_basin ?? 0),
        underReview: Boolean(row.under_review),
        lastActivityAt: row.last_activity_at ?? row.updated_at,
        lowFloatAlert: lowFloat,
        operationalFrozen: frozen,
        accountDisabled: disabled,
      })
    }

    const lowFloatCount = retailers.filter((r) => r.lowFloatAlert).length

    return NextResponse.json({
      retailers,
      lowFloatCount,
      lowFloatThresholdUsd: LOW_FLOAT_USD,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as {
      retailerProfileId?: string
      action?: "freeze" | "block" | "suspend" | "activate"
      reason?: string
    }
    const retailerProfileId = typeof body.retailerProfileId === "string" ? body.retailerProfileId.trim() : ""
    const action = body.action
    if (!retailerProfileId || !action) {
      return NextResponse.json({ error: "retailerProfileId and action are required." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: desk, error: dErr } = await admin
      .from("retailer_profiles")
      .select("id,user_id,liquidity_status")
      .eq("id", retailerProfileId)
      .maybeSingle()
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })
    if (!desk) return NextResponse.json({ error: "Retailer not found." }, { status: 404 })

    const uid = String(desk.user_id)
    const now = new Date().toISOString()
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null

    if (action === "activate") {
      await admin
        .from("retailer_profiles")
        .update({
          liquidity_status: "active",
          under_review: false,
          under_review_reason: null,
          updated_at: now,
        })
        .eq("id", retailerProfileId)
      await admin
        .from("profiles")
        .update({ operational_freeze_at: null, account_disabled_at: null })
        .eq("id", uid)
    } else if (action === "freeze") {
      await admin
        .from("retailer_profiles")
        .update({ liquidity_status: "frozen", updated_at: now })
        .eq("id", retailerProfileId)
      await admin.from("profiles").update({ operational_freeze_at: now }).eq("id", uid)
    } else if (action === "block") {
      await admin
        .from("retailer_profiles")
        .update({
          liquidity_status: "blocked",
          under_review: true,
          under_review_reason: reason || "Blocked by Level 5 admin.",
          updated_at: now,
        })
        .eq("id", retailerProfileId)
    } else if (action === "suspend") {
      await admin
        .from("retailer_profiles")
        .update({ liquidity_status: "suspended", updated_at: now })
        .eq("id", retailerProfileId)
      await admin.from("profiles").update({ account_disabled_at: now }).eq("id", uid)
    } else {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 })
    }

    return NextResponse.json({ ok: true, action, retailerProfileId })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
