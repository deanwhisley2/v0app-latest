import { NextResponse } from "next/server"
import { COPY_TRADE_CYCLE_MS } from "@/lib/copy-trade-policy"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { settleCopyTradeSessionForUser } from "@/lib/server/copy-trade-settle"

/**
 * Expire stale copy-trade sessions (24h+): canonical scheduled settlement
 * (stake → Nexus Main; 0.71% gross earnings − 1.5% fee → container liquid).
 * Protect with `CRON_SECRET`: send header `x-cron-secret: <value>` or `Authorization: Bearer <value>`.
 */
export async function POST(request: Request) {
  try {
    const configured = process.env.CRON_SECRET?.trim()
    const headerSecret =
      request.headers.get("x-cron-secret")?.trim() ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    if (!configured || headerSecret !== configured) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const cutoffIso = new Date(Date.now() - COPY_TRADE_CYCLE_MS).toISOString()
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from("copy_trade_sessions")
      .select("id,user_id")
      .eq("status", "active")
      .is("settled_at", null)
      .lt("created_at", cutoffIso)

    if (error) throw new Error(error.message)

    let settled = 0
    const failures: Array<{ sessionId: string; message: string }> = []

    for (const r of rows ?? []) {
      try {
        await settleCopyTradeSessionForUser(admin, {
          userId: r.user_id as string,
          sessionId: r.id as string,
          floatingPnLUsd: 0,
          coinImpactFraction: 0,
          financialActorType: "system",
          kind: "scheduled",
        })
        settled += 1
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg === "SETTLEMENT_CONFLICT") continue
        failures.push({ sessionId: String(r.id), message: msg })
      }
    }

    return NextResponse.json({ ok: true, scanned: (rows ?? []).length, settled, failures })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
