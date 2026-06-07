#!/usr/bin/env npx tsx
/**
 * Force-release trade sessions stuck in booked/running past scheduled end.
 * Runs the matrix-backed settlement controller and returns principal to Nexus Main.
 *
 * Usage:
 *   npx tsx scripts/force-release-booked-session.ts --dry-run
 *   npx tsx scripts/force-release-booked-session.ts --apply
 *   npx tsx scripts/force-release-booked-session.ts --apply --user-id <uuid>
 */

import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { TRADE_SESSION_OPEN_STATUSES } from "../lib/nexus-bot/user-session-messaging"
import { settleTradeSessionBotParticipant } from "../lib/server/nexus-bot-session-service"
import {
  hasTradeSessionFinancialResolution,
  hasTradeSessionOpenReservation,
} from "../lib/server/nexus-bot-settlement-integrity"
import { advanceTradeSessionLifecycle } from "../lib/server/trade-sessions"

config({ path: resolve(process.cwd(), ".env.local") })

function argFlag(name: string): boolean {
  return process.argv.includes(name)
}

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1]?.trim() ?? null
}

async function main() {
  const dryRun = !argFlag("--apply")
  const userId = argValue("--user-id") ?? undefined
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  if (!dryRun) {
    const lifecycle = await advanceTradeSessionLifecycle(admin, { userId })
    console.log("[force-release-booked-session] lifecycle pass:", JSON.stringify(lifecycle))
  }

  let q = admin
    .from("nexus_bot_sessions")
    .select(
      "id,user_id,status,stake_usd,trade_session_id,queued_at,participation_weight,ends_at,trade_sessions(start_at,end_at,session_slot)",
    )
    .not("trade_session_id", "is", null)
    .gt("stake_usd", 0)
    .in("status", [...TRADE_SESSION_OPEN_STATUSES])
  if (userId) q = q.eq("user_id", userId)
  const { data, error } = await q.limit(200)
  if (error) throw new Error(error.message)

  let settled = 0
  for (const row of data ?? []) {
    const ts = row.trade_sessions as {
      start_at?: string
      end_at?: string
      session_slot?: string
    } | null
    const endAt = ts?.end_at ?? row.ends_at
    if (!endAt || String(endAt) >= nowIso) continue

    const botSessionId = String(row.id)
    const uid = String(row.user_id)
    const hasOpen = await hasTradeSessionOpenReservation(admin, uid, botSessionId)
    if (!hasOpen) continue
    const resolved = await hasTradeSessionFinancialResolution(admin, uid, botSessionId)
    if (resolved) continue

    const startAt = ts?.start_at ? String(ts.start_at) : String(endAt)
    const sessionSlot = String(ts?.session_slot ?? "morning")

    console.log(
      `[force-release-booked-session] ${dryRun ? "DRY-RUN would settle" : "Settling"} botSession=${botSessionId} user=${uid} status=${row.status} stake_usd=${row.stake_usd} end_at=${endAt}`,
    )
    if (dryRun) {
      settled += 1
      continue
    }

    const result = await settleTradeSessionBotParticipant(admin, {
      id: botSessionId,
      userId: uid,
      stakeUsd: Number(row.stake_usd ?? 0),
      tradeSessionId: String(row.trade_session_id),
      participationWeight: Number(row.participation_weight ?? 1),
      joinedAt: row.queued_at ? String(row.queued_at) : null,
      sessionStartAt: startAt,
      sessionEndAt: String(endAt),
      sessionSlot,
      forceFullParticipation: true,
    })
    if (result) {
      settled += 1
      console.log(
        `[force-release-booked-session] settled botSession=${botSessionId} profit_usd=${result.profitUsd}`,
      )
    } else {
      console.warn(`[force-release-booked-session] settlement returned null for ${botSessionId}`)
    }
  }

  console.log(
    `[force-release-booked-session] ${dryRun ? "Would settle" : "Settled"} ${settled} participant(s)`,
  )
}

void main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.message : e)
  process.exit(1)
})
