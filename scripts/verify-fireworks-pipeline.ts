#!/usr/bin/env npx tsx
/**
 * Real-account fireworks pipeline verification (server-side data plane).
 * Usage: npx tsx scripts/verify-fireworks-pipeline.ts --user-id <uuid>
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { findPendingProfitCelebration } from "../lib/server/nexus-bot-session-service"

config({ path: resolve(process.cwd(), ".env.local") })

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1]?.trim() ?? null
}

async function main() {
  const userId =
    argValue("--user-id") ?? "da62bc0b-fee5-43f1-8cca-84fed871f385"
  const admin = createAdminClient()

  const pending = await findPendingProfitCelebration(admin, userId)
  console.log("pendingProfitCelebration:", pending)

  const { data: botRow } = await admin
    .from("nexus_bot_sessions")
    .select("id,status,profit_released_usd,settled_at,profit_celebrated_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("settled_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!botRow) {
    console.error("No completed bot session for user")
    process.exit(1)
  }

  const sessionId = String(botRow.id)

  const { data: history } = await admin
    .from("container_balance_events")
    .select("id,event_type,summary,created_at")
    .eq("user_id", userId)
    .eq("related_session_id", sessionId)
    .in("event_type", ["nexus_trade_session_complete", "nexus_trade_session_reconcile_topup"])
    .order("created_at", { ascending: false })
    .limit(3)

  const { data: notifs } = await admin
    .from("user_account_notifications")
    .select("id,title,body,created_at,source_kind,source_id")
    .eq("user_id", userId)
    .eq("source_kind", "trade_session_complete")
    .eq("source_id", sessionId)
    .limit(1)

  const { data: balance } = await admin
    .from("user_balances")
    .select("available_balance,container_withdrawable_earnings")
    .eq("user_id", userId)
    .maybeSingle()

  console.log("latestCompletedSession:", botRow)
  console.log("historyEvents:", history ?? [])
  console.log("serverNotification:", notifs?.[0] ?? null)
  console.log("balances:", balance)

  const checks = {
    pendingCelebrationReady: Boolean(pending?.sessionId),
    historyEntry: (history ?? []).length > 0,
    hasBalances: Boolean(balance),
  }
  console.log("checks:", checks)

  if (!checks.pendingCelebrationReady) {
    console.error("FAIL: no pending celebration (already acked or zero profit?)")
    process.exit(1)
  }
  if (!checks.historyEntry) {
    console.error("FAIL: no history ledger entry for session")
    process.exit(1)
  }
  console.log("verify-fireworks-pipeline: PASS (server data plane)")
}

void main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.message : e)
  process.exit(1)
})
