import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"

function normalizeIso2(v: unknown): string | null {
  const cc = typeof v === "string" ? v.trim().toUpperCase().slice(0, 2) : ""
  return cc.length === 2 ? cc : null
}

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const status = (searchParams.get("status") ?? "PENDING").trim().toUpperCase()
    const statuses = ["PENDING", "APPROVED", "REJECTED"]
    const target = statuses.includes(status) ? status : "PENDING"

    const { data, error } = await admin
      .from("retailer_applications")
      .select("id,user_id,full_name,region,phone,payment_method,whatsapp_contact,status,reviewed_by,reviewed_at,created_at")
      .eq("status", target)
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ applications: data ?? [] })
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
      applicationId?: string
      action?: "APPROVE" | "REJECT"
      resolutionNote?: string
    }
    const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : ""
    const action = typeof body.action === "string" ? body.action.trim().toUpperCase() : ""
    if (!applicationId || (action !== "APPROVE" && action !== "REJECT")) {
      return NextResponse.json({ error: "applicationId and action(APPROVE|REJECT) are required." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: app, error: appErr } = await admin
      .from("retailer_applications")
      .select("id,user_id,region,status")
      .eq("id", applicationId)
      .maybeSingle()
    if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 })
    if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 })
    if (String(app.status) !== "PENDING") {
      return NextResponse.json({ error: "Application already resolved." }, { status: 409 })
    }

    const now = new Date().toISOString()
    const nextStatus = action === "APPROVE" ? "APPROVED" : "REJECTED"
    const { error: upAppErr } = await admin
      .from("retailer_applications")
      .update({
        status: nextStatus,
        reviewed_by: actor.id,
        reviewed_at: now,
      })
      .eq("id", applicationId)
      .eq("status", "PENDING")
    if (upAppErr) return NextResponse.json({ error: upAppErr.message }, { status: 500 })

    if (action === "APPROVE") {
      const region = normalizeIso2(app.region)
      const { error: upUsersErr } = await admin
        .from("users")
        .upsert(
          {
            id: app.user_id,
            role: "RETAILER",
            level: 2,
            region,
            verified: true,
            activated_by: actor.id,
            updated_at: now,
          },
          { onConflict: "id" }
        )
      if (upUsersErr) return NextResponse.json({ error: upUsersErr.message }, { status: 500 })

      const { error: upProfileErr } = await admin
        .from("profiles")
        .update({
          trading_user_level: 2,
          funding_country_code: region,
          updated_at: now,
        })
        .eq("id", app.user_id)
      if (upProfileErr) return NextResponse.json({ error: upProfileErr.message }, { status: 500 })

      const { error: upDeskErr } = await admin
        .from("retailer_profiles")
        .upsert(
          {
            user_id: app.user_id,
            under_review: false,
            is_country_retailer: true,
            country_code: region,
            liquidity_status: "offline",
            updated_at: now,
          },
          { onConflict: "user_id" }
        )
      if (upDeskErr) return NextResponse.json({ error: upDeskErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      status: nextStatus,
      resolutionNote: typeof body.resolutionNote === "string" ? body.resolutionNote.trim().slice(0, 280) : null,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
