/**
 * Ops: cancel open booked trade sessions (return stake to Nexus Main) and re-arm
 * profit celebration fireworks for the latest completed session.
 *
 *   npx tsx scripts/revert-user-trade-celebration.ts --email aminsimaganda2@gmail.com
 *   npx tsx scripts/revert-user-trade-celebration.ts --user-id <uuid> --dry-run
 */

import { config } from "dotenv"
import { resolve } from "path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { casCreditNexusMainOnly } from "../lib/server/nexus-main-enforcement"
import { recordFinancialEvent } from "../lib/server/financial-events"
import { findPendingProfitCelebration } from "../lib/server/nexus-bot-session-service"
import { TRADE_SESSION_OPEN_STATUSES } from "../lib/nexus-bot/user-session-messaging"
import { roundUsd2 } from "../lib/nexus-financial-policy"

config({ path: resolve(process.cwd(), ".env.local") })

function parseArgs(argv: string[]) {
  let email = ""
  let userId = ""
  let dryRun = false
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--email" && argv[i + 1]) email = argv[++i].trim().toLowerCase()
    else if (argv[i] === "--user-id" && argv[i + 1]) userId = argv[++i].trim()
    else if (argv[i] === "--dry-run") dryRun = true
  }
  return { email, userId, dryRun }
}

async function resolveUserId(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  userId: string,
): Promise<string> {
  if (userId) return userId
  if (!email) {
    throw new Error("Provide --email or --user-id")
  }
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)
  const hit = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === email)
  if (!hit) throw new Error(`No auth user for ${email}`)
  return hit.id
}

async function main() {
  const { email, userId: userIdArg, dryRun } = parseArgs(process.argv)
  const admin = createAdminClient()
  const userId = await resolveUserId(admin, email, userIdArg)

  const { data: openRows, error: openErr } = await admin
    .from("nexus_bot_sessions")
    .select("id,status,stake_usd,trade_session_id")
    .eq("user_id", userId)
    .in("status", [...TRADE_SESSION_OPEN_STATUSES])
  if (openErr) throw new Error(openErr.message)

  const cancelled: Array<{ sessionId: string; stakeUsd: number }> = []
  for (const row of openRows ?? []) {
    const sessionId = String(row.id)
    const stakeUsd = roundUsd2(Number(row.stake_usd ?? 0))
    console.log("cancel_open_session", { sessionId, status: row.status, stakeUsd, dryRun })
    if (dryRun) {
      cancelled.push({ sessionId, stakeUsd })
      continue
    }

    const { error: cancelErr } = await admin
      .from("nexus_bot_sessions")
      .update({ status: "cancelled", display_phase: "completed" })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .in("status", [...TRADE_SESSION_OPEN_STATUSES])
    if (cancelErr) throw new Error(cancelErr.message)

    if (stakeUsd > 0) {
      await casCreditNexusMainOnly(admin, userId, stakeUsd)
      await recordFinancialEvent({
        userId,
        eventType: "nexus_trade_session_cancel",
        category: "container",
        amount: stakeUsd,
        balanceSource: "nexus_bot_session",
        balanceDestination: "available_balance",
        status: "completed",
        actorType: "admin",
        actorId: userId,
        relatedSessionId: sessionId,
        summary: "Trade booking cancelled — reserved capital returned to Nexus Main.",
        metadata: {
          session_id: sessionId,
          trade_session_id: row.trade_session_id ?? null,
          stake_returned_usd: stakeUsd,
          ops_revert: true,
        },
      })
    }
    cancelled.push({ sessionId, stakeUsd })
  }

  const { data: completed, error: compErr } = await admin
    .from("nexus_bot_sessions")
    .select("id,profit_released_usd,stake_usd,profit_celebrated_at,settled_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("settled_at", "is", null)
    .order("settled_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (compErr) throw new Error(compErr.message)

  let celebrationReset: { sessionId: string; profitUsd: number } | null = null
  if (completed) {
    celebrationReset = {
      sessionId: String(completed.id),
      profitUsd: roundUsd2(Number(completed.profit_released_usd ?? 0)),
    }
    console.log("reset_celebration", { ...celebrationReset, dryRun })
    if (!dryRun) {
      const { error: resetErr } = await admin
        .from("nexus_bot_sessions")
        .update({ profit_celebrated_at: null })
        .eq("id", celebrationReset.sessionId)
        .eq("user_id", userId)
        .eq("status", "completed")
      if (resetErr) throw new Error(resetErr.message)
    }
  }

  const { data: balance } = await admin
    .from("user_balances")
    .select("available_balance,container_withdrawable_earnings")
    .eq("user_id", userId)
    .maybeSingle()

  const pending = dryRun ? null : await findPendingProfitCelebration(admin, userId)

  console.log("revert-user-trade-celebration: OK", {
    userId,
    email: email || null,
    cancelledSessions: cancelled,
    celebrationReset,
    balance,
    pendingProfitCelebration: pending,
    dryRun,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
