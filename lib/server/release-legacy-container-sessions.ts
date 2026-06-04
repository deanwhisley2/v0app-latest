import type { SupabaseClient } from "@supabase/supabase-js"
import { settleCopyTradeSessionForUser } from "@/lib/server/copy-trade-settle"
import { settleFixedTradeEarlyExitForUser } from "@/lib/server/fixed-trade-early-exit-settle"

export type LegacyReleaseSummary = {
  copySessionsClosed: number
  fixedSessionsClosed: number
  liquidTransferredUsd: number
  errors: string[]
}

/**
 * Close all active copy/fixed container sessions. Earnings remain in pocket until the user transfers manually.
 * Uses existing settlement RPCs — never raw balance bumps.
 */
export async function releaseLegacyContainerSessionsForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<LegacyReleaseSummary> {
  const errors: string[] = []
  let copySessionsClosed = 0
  let fixedSessionsClosed = 0
  let liquidTransferredUsd = 0

  const { data: copies, error: cErr } = await admin
    .from("copy_trade_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
  if (cErr) throw new Error(cErr.message)

  for (const row of copies ?? []) {
    try {
      await settleCopyTradeSessionForUser(admin, {
        userId,
        sessionId: String(row.id),
        floatingPnLUsd: 0,
        coinImpactFraction: 0,
        kind: "force",
        financialActorType: "system",
      })
      copySessionsClosed += 1
    } catch (e) {
      errors.push(`copy:${row.id}:${e instanceof Error ? e.message : "error"}`)
    }
  }

  const { data: fixes, error: fErr } = await admin
    .from("fixed_trade_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
  if (fErr) throw new Error(fErr.message)

  for (const row of fixes ?? []) {
    try {
      await settleFixedTradeEarlyExitForUser(admin, { userId, sessionId: String(row.id) })
      fixedSessionsClosed += 1
    } catch (e) {
      errors.push(`fix:${row.id}:${e instanceof Error ? e.message : "error"}`)
    }
  }

  return { copySessionsClosed, fixedSessionsClosed, liquidTransferredUsd, errors }
}
