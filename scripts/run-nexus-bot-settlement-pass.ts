#!/usr/bin/env npx tsx
/**
 * Executes a single Nexus Bot settlement pass (admin/service role):
 * - syncTradeSessionBotStates: settle ended trade sessions and mark participants completed
 * - completeDueNexusBotSessions: handle legacy bot sessions without trade_session_id
 * - expireDueTradeSessions: mark ended trade_sessions rows as expired
 *
 * This is intended for ops/incident recovery when cron hasn't run yet.
 *
 * Usage:
 *   npx tsx scripts/run-nexus-bot-settlement-pass.ts
 *   npx tsx scripts/run-nexus-bot-settlement-pass.ts --user-id <uuid>
 */

import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { computeTradeSessionSettlementMonitoring } from "../lib/server/trade-session-settlement-monitoring"
import { advanceTradeSessionLifecycle } from "../lib/server/trade-sessions"

config({ path: resolve(process.cwd(), ".env.local") })

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1]?.trim() ?? null
}

async function main() {
  const admin = createAdminClient()
  const userId = argValue("--user-id") ?? undefined

  const { expiredTradeSessions, legacyCompleted, repair: repairResult } =
    await advanceTradeSessionLifecycle(admin, { userId })
  const settlementMonitoring = await computeTradeSessionSettlementMonitoring(admin)

  console.log(
    `[run-nexus-bot-settlement-pass] userId=${userId ?? "ALL"} legacyCompleted=${legacyCompleted} expiredTradeSessions=${expiredTradeSessions} repair=${JSON.stringify(repairResult)} stranded=${settlementMonitoring.hasStrandedCapital} totalStrandedUsd=${settlementMonitoring.totalStrandedStakeUsd}`,
  )
}

void main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.message : e)
  process.exit(1)
})

