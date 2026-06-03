import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { normalizeSignalCode, type NexusSignalSlot } from "@/lib/nexus-bot/plans"

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("nexus_signal_codes")
      .select(
        "id,slot,code,strategy_title,confidence,duration_hours,window_opens_at,window_closes_at,created_at",
      )
      .order("window_opens_at", { ascending: false })
      .limit(40)
    if (error) throw new Error(error.message)
    return NextResponse.json({ codes: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as {
      slot?: NexusSignalSlot
      code?: string
      strategyTitle?: string
      confidence?: string
      durationHours?: number
      windowOpensAt?: string
      windowClosesAt?: string
    }
    const slot = body.slot === "evening" ? "evening" : body.slot === "morning" ? "morning" : null
    const code = normalizeSignalCode(body.code ?? "")
    const strategyTitle = (body.strategyTitle ?? "").trim()
    if (!slot || !code || !strategyTitle) {
      return NextResponse.json({ error: "slot, code, and strategyTitle are required." }, { status: 400 })
    }

    const opens = body.windowOpensAt ? new Date(body.windowOpensAt) : new Date()
    const closes = body.windowClosesAt
      ? new Date(body.windowClosesAt)
      : new Date(opens.getTime() + (Number(body.durationHours ?? 12) || 12) * 3_600_000)
    if (!(closes.getTime() > opens.getTime())) {
      return NextResponse.json({ error: "windowClosesAt must be after windowOpensAt." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("nexus_signal_codes")
      .insert({
        slot,
        code,
        strategy_title: strategyTitle,
        confidence: (body.confidence ?? "High").trim(),
        duration_hours: Math.min(720, Math.max(1, Number(body.durationHours ?? 12) || 12)),
        window_opens_at: opens.toISOString(),
        window_closes_at: closes.toISOString(),
        published_by: actor.id,
      })
      .select("id,slot,code,strategy_title,window_opens_at,window_closes_at")
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, code: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
