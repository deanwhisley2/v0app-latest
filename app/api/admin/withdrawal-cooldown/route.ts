import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { clearWithdrawalRejectionCooldown } from "@/lib/server/withdrawal-rejection-cooldown"

/** Level 5 ops: clear automated payout hold after consecutive rejections. */
export async function PATCH(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as { userId?: string }
    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 })
    }

    const admin = createAdminClient()
    await clearWithdrawalRejectionCooldown(admin, userId)

    return NextResponse.json({ ok: true, userId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const code = msg.includes("Level 5") ? 403 : 500
    return NextResponse.json({ error: msg }, { status: code })
  }
}
