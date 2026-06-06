import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"

export const dynamic = "force-dynamic"

/**
 * Ops/support audit: explain why a user earned a specific trade-session amount.
 * Query: ?userId=...&tradeSessionId=... (either or both)
 */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")?.trim() || null
    const tradeSessionId = searchParams.get("tradeSessionId")?.trim() || null
    if (!userId && !tradeSessionId) {
      return NextResponse.json({ error: "Provide userId and/or tradeSessionId" }, { status: 400 })
    }

    const admin = createAdminClient()
    let q = admin.from("user_earnings_explanation_v1").select("*").limit(50)
    if (userId) q = q.eq("user_id", userId)
    if (tradeSessionId) q = q.eq("trade_session_id", tradeSessionId)
    const { data, error } = await q.order("assigned_at", { ascending: false })
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, rows: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
