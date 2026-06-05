#!/usr/bin/env npx tsx
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { appendUserAccountNotification } from "../lib/server/user-account-notifications"
import { roundUsd2 } from "../lib/nexus-financial-policy"

config({ path: resolve(process.cwd(), ".env.local") })

async function main() {
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from("nexus_bot_sessions")
    .select("id,user_id,profit_released_usd,settled_at")
    .eq("status", "completed")
    .not("trade_session_id", "is", null)
    .is("profit_celebrated_at", null)
    .not("settled_at", "is", null)
  if (error) throw new Error(error.message)

  let created = 0
  for (const row of rows ?? []) {
    const sessionId = String(row.id)
    const userId = String(row.user_id)
    const profit = roundUsd2(Number(row.profit_released_usd ?? 0))
    const { data: existing } = await admin
      .from("user_account_notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("source_kind", "trade_session_complete")
      .eq("source_id", sessionId)
      .maybeSingle()
    if (existing) continue

    await appendUserAccountNotification(admin, {
      userId,
      sourceKind: "trade_session_complete",
      sourceId: sessionId,
      notificationType: "trade",
      title: profit > 0 ? "Trade session complete" : "Session complete",
      body:
        profit > 0
          ? "Released earnings credited to your Pocket balance."
          : "Your trade session has completed. Capital returned to Nexus Main.",
      nav: { kind: "trade" },
      metadata: {
        amount_usd: profit,
        session_id: sessionId,
        backfill: true,
      },
    })
    created += 1
  }
  console.log(`backfill-pending-celebration-notifications: created=${created}`)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
