import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { NEXUS_AUTO_TRADE_PLAN_KEYS } from "@/lib/nexus-bot/plans"

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const userId = new URL(request.url).searchParams.get("userId")?.trim() ?? ""
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("nexus_bot_auto_trade_grants")
      .select("plan_key,enabled,updated_at")
      .eq("user_id", userId)
    if (error) throw new Error(error.message)

    const grants: Record<string, boolean> = {}
    for (const k of NEXUS_AUTO_TRADE_PLAN_KEYS) grants[k] = false
    for (const r of data ?? []) grants[String(r.plan_key)] = Boolean(r.enabled)

    return NextResponse.json({ userId, grants })
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
      userId?: string
      grants?: Record<string, boolean>
    }
    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

    const admin = createAdminClient()
    const now = new Date().toISOString()
    for (const key of NEXUS_AUTO_TRADE_PLAN_KEYS) {
      if (!(key in (body.grants ?? {}))) continue
      const enabled = Boolean(body.grants![key])
      const { error } = await admin.from("nexus_bot_auto_trade_grants").upsert(
        {
          user_id: userId,
          plan_key: key,
          enabled,
          granted_by: actor.id,
          updated_at: now,
        },
        { onConflict: "user_id,plan_key" },
      )
      if (error) throw new Error(error.message)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
