/**
 * Cancel all open trade-session participants on legacy (pre-yield-v2) sessions
 * and refund reserved stake to Nexus Main.
 *
 *   npx tsx scripts/cancel-legacy-trade-sessions.ts --dry-run
 *   npx tsx scripts/cancel-legacy-trade-sessions.ts --apply
 */

import { config } from "dotenv"
import { resolve } from "path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { casCreditNexusMainOnly } from "../lib/server/nexus-main-enforcement"
import { recordFinancialEvent } from "../lib/server/financial-events"
import { TRADE_SESSION_OPEN_STATUSES } from "../lib/nexus-bot/user-session-messaging"
import { roundUsd2 } from "../lib/nexus-financial-policy"

config({ path: resolve(process.cwd(), ".env.local") })

function parseArgs(argv: string[]) {
  let apply = false
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--apply") apply = true
  }
  return { apply, dryRun: !apply }
}

async function main() {
  const { apply, dryRun } = parseArgs(process.argv)
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: rows, error } = await admin
    .from("nexus_bot_sessions")
    .select(
      "id,user_id,status,stake_usd,trade_session_id,trade_sessions(id,code,status,max_yield_percent)",
    )
    .not("trade_session_id", "is", null)
    .in("status", [...TRADE_SESSION_OPEN_STATUSES])
  if (error) throw new Error(error.message)

  const legacy = (rows ?? []).filter((r) => {
    const ts = r.trade_sessions as { max_yield_percent?: number | null } | null
    return !ts?.max_yield_percent || Number(ts.max_yield_percent) <= 0
  })

  const results: Array<Record<string, unknown>> = []

  for (const row of legacy) {
    const tsRaw = row.trade_sessions as
      | { id: string; code: string; status: string; max_yield_percent?: number | null }
      | Array<{ id: string; code: string; status: string; max_yield_percent?: number | null }>
      | null
    const ts = Array.isArray(tsRaw) ? tsRaw[0] ?? null : tsRaw
    const sessionId = String(row.id)
    const userId = String(row.user_id)
    const stake = roundUsd2(Number(row.stake_usd ?? 0))
    const entry = {
      botSessionId: sessionId,
      userId,
      tradeSessionCode: ts?.code ?? "",
      stakeUsd: stake,
      dryRun,
    }
    console.log("cancel_legacy_participant", entry)

    if (dryRun) {
      results.push({ ...entry, status: "dry_run" })
      continue
    }

    const { error: cancelErr } = await admin
      .from("nexus_bot_sessions")
      .update({
        status: "cancelled",
        display_phase: "completed",
        settled_at: now,
        profit_released_usd: 0,
      })
      .eq("id", sessionId)
      .in("status", [...TRADE_SESSION_OPEN_STATUSES])
    if (cancelErr) throw new Error(cancelErr.message)

    if (stake > 0) {
      await casCreditNexusMainOnly(admin, userId, stake)
      await recordFinancialEvent({
        userId,
        eventType: "nexus_trade_session_cancel",
        category: "container",
        amount: stake,
        balanceSource: "nexus_bot_session",
        balanceDestination: "available_balance",
        status: "completed",
        actorType: "admin",
        actorId: userId,
        relatedSessionId: sessionId,
        summary: "Legacy session cancelled — stake returned (yield v2 migration).",
        metadata: {
          session_id: sessionId,
          trade_session_id: row.trade_session_id,
          stake_returned_usd: stake,
          legacy_earnings_cancelled: true,
          yield_v2_migration: true,
        },
      })
    }

    results.push({ ...entry, status: "cancelled" })
  }

  const { data: activeLegacySessions, error: tsErr } = await admin
    .from("trade_sessions")
    .select("id,code,status")
    .eq("status", "active")
    .or("max_yield_percent.is.null,max_yield_percent.lte.0")
  if (tsErr) throw new Error(tsErr.message)

  for (const ts of activeLegacySessions ?? []) {
    console.log("expire_legacy_trade_session", { code: ts.code, id: ts.id, dryRun })
    if (dryRun) continue
    await admin
      .from("trade_sessions")
      .update({ status: "expired", expired_at: now })
      .eq("id", ts.id)
      .eq("status", "active")
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply,
        legacyParticipantsCancelled: results.length,
        legacyActiveSessionsExpired: activeLegacySessions?.length ?? 0,
        results,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
