import { NextResponse } from "next/server"
import { COPY_TRADE_CYCLE_MS } from "@/lib/copy-trade-policy"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { settleCopyTradeSessionForUser } from "@/lib/server/copy-trade-settle"

type Model = { earnedUsd?: number; drawdownPct?: number }

/**
 * Expire stale copy-trade sessions (24h+) using last modeled marks from session metadata when present.
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
      .select("id,user_id,metadata")
      .eq("status", "active")
      .is("settled_at", null)
      .lt("created_at", cutoffIso)

    if (error) throw new Error(error.message)

    let settled = 0
    const failures: Array<{ sessionId: string; message: string }> = []

    for (const r of rows ?? []) {
      const md = (r.metadata ?? {}) as { model?: Model }
      const m = md.model ?? {}
      const floating = typeof m.earnedUsd === "number" && Number.isFinite(m.earnedUsd) ? m.earnedUsd : 0
      const coinImpact =
        typeof m.drawdownPct === "number" && Number.isFinite(m.drawdownPct) ? Math.max(0, Math.min(0.85, m.drawdownPct)) : 0
      try {
        await settleCopyTradeSessionForUser(admin, {
          userId: r.user_id as string,
          sessionId: r.id as string,
          floatingPnLUsd: floating,
          coinImpactFraction: coinImpact,
          financialActorType: "system",
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
