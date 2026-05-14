import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { officialLeaseEndDate } from "@/lib/fixed-trade-session-lease"
import type { FixPeriodMonths } from "@/lib/container-earnings-schedule"
import { settleFixedTradeMaturityForUser } from "@/lib/server/fixed-trade-maturity-settle"

const MAX_ATTEMPTS_BEFORE_DLQ = 8

/**
 * Maturity worker: settle fixed sessions past lease end (principal → Nexus Main; terminal net → container liquid).
 * Guard with `CRON_SECRET` (header `x-cron-secret` or `Authorization: Bearer`).
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

    const admin = createAdminClient()
    const now = new Date()
    const { data: rows, error } = await admin
      .from("fixed_trade_sessions")
      .select(
        "id,user_id,created_at,fix_period_months,status,maturity_settled_at,maturity_attempts,maturity_next_retry_at",
      )
      .eq("status", "active")
      .is("maturity_settled_at", null)
      .order("created_at", { ascending: true })
      .limit(250)

    if (error) throw new Error(error.message)

    const due = (rows ?? []).filter((r) => {
      const months = Number(r.fix_period_months) as FixPeriodMonths
      const leaseEnd = officialLeaseEndDate(String(r.created_at), months)
      if (now.getTime() < leaseEnd.getTime()) return false
      const next = (r as { maturity_next_retry_at?: string | null }).maturity_next_retry_at
      if (next && new Date(next).getTime() > now.getTime()) return false
      const attempts = Number((r as { maturity_attempts?: unknown }).maturity_attempts ?? 0)
      return attempts < MAX_ATTEMPTS_BEFORE_DLQ
    })

    let settled = 0
    let idempotent = 0
    const failures: Array<{ sessionId: string; message: string }> = []

    for (const r of due) {
      const sessionId = String(r.id)
      const userId = String(r.user_id)
      const prevAttempts = Number((r as { maturity_attempts?: unknown }).maturity_attempts ?? 0)
      try {
        const out = await settleFixedTradeMaturityForUser(admin, { sessionId, userId })
        if (out.idempotent) idempotent += 1
        else settled += 1
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg === "LEASE_NOT_ENDED") continue
        failures.push({ sessionId, message: msg })
        const nextAttempts = prevAttempts + 1
        const backoffMs = Math.min(86_400_000, 60_000 * 2 ** Math.min(nextAttempts, 12))
        const nextRetryIso = new Date(Date.now() + backoffMs).toISOString()
        const patch: Record<string, unknown> = {
          maturity_attempts: nextAttempts,
          maturity_last_error: msg.slice(0, 2000),
          maturity_next_retry_at: nextRetryIso,
        }
        if (nextAttempts >= MAX_ATTEMPTS_BEFORE_DLQ) {
          patch.status = "failed_settlement"
          patch.maturity_next_retry_at = null
        }
        const { error: uErr } = await admin.from("fixed_trade_sessions").update(patch).eq("id", sessionId)
        if (uErr) failures.push({ sessionId, message: `retry_state_update:${uErr.message}` })
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: (rows ?? []).length,
      due: due.length,
      settled,
      idempotent,
      failures,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
