import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { releaseLegacyContainerSessionsForUser } from "@/lib/server/release-legacy-container-sessions"

export async function POST(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as { userId?: string; allUsers?: boolean }
    const admin = createAdminClient()

    if (body.allUsers === true) {
      const { data: copyUsers } = await admin
        .from("copy_trade_sessions")
        .select("user_id")
        .eq("status", "active")
      const { data: fixUsers } = await admin
        .from("fixed_trade_sessions")
        .select("user_id")
        .eq("status", "active")
      const ids = new Set<string>()
      for (const r of copyUsers ?? []) ids.add(String(r.user_id))
      for (const r of fixUsers ?? []) ids.add(String(r.user_id))

      const summaries: Array<{ userId: string; summary: Awaited<ReturnType<typeof releaseLegacyContainerSessionsForUser>> }> = []
      for (const userId of ids) {
        summaries.push({ userId, summary: await releaseLegacyContainerSessionsForUser(admin, userId) })
      }
      return NextResponse.json({ ok: true, usersProcessed: summaries.length, summaries })
    }

    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    if (!userId) {
      return NextResponse.json({ error: "userId or allUsers required" }, { status: 400 })
    }
    const summary = await releaseLegacyContainerSessionsForUser(admin, userId)
    return NextResponse.json({ ok: true, summary })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
