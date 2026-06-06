import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

export type TradeSessionSettlementKind = "complete" | "reconcile_topup" | "cancel"

export type ClaimIdempotencyResult =
  | { status: "claimed" }
  | { status: "duplicate"; reason: "idempotency_key" | "session_user_kind_amount" }

export function tradeSessionCompleteIdempotencyKey(botSessionId: string): string {
  return `complete:${botSessionId}`
}

export function tradeSessionTopupIdempotencyKey(botSessionId: string, amountUsd: number): string {
  return `topup:${botSessionId}:${roundUsd2(amountUsd).toFixed(2)}`
}

/** Sum prior reconcile top-ups already credited for this participant session. */
export async function sumTradeSessionReconcileTopupUsd(
  admin: SupabaseClient,
  userId: string,
  botSessionId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("container_balance_events")
    .select("gross_amount")
    .eq("user_id", userId)
    .eq("related_session_id", botSessionId)
    .eq("event_type", "nexus_trade_session_reconcile_topup")
  if (error) throw new Error(error.message)
  let total = 0
  for (const row of data ?? []) {
    total += Number(row.gross_amount ?? 0)
  }
  return roundUsd2(total)
}

/**
 * Claim settlement idempotency before any balance credit.
 * Database UNIQUE constraints reject duplicate payout attempts.
 */
export async function claimTradeSessionSettlementIdempotency(
  admin: SupabaseClient,
  params: {
    idempotencyKey: string
    userId: string
    botSessionId: string
    settlementKind: TradeSessionSettlementKind
    amountUsd: number
    ledgerEventId?: string | null
  },
): Promise<ClaimIdempotencyResult> {
  const { error } = await admin.from("trade_session_settlement_idempotency").insert({
    idempotency_key: params.idempotencyKey,
    user_id: params.userId,
    bot_session_id: params.botSessionId,
    settlement_kind: params.settlementKind,
    amount_usd: roundUsd2(params.amountUsd),
    ledger_event_id: params.ledgerEventId ?? null,
  })

  if (!error) return { status: "claimed" }

  if (error.code === "23505") {
    const msg = String(error.message ?? "")
    if (msg.includes("trade_session_settlement_idempotency_key_unique")) {
      return { status: "duplicate", reason: "idempotency_key" }
    }
    return { status: "duplicate", reason: "session_user_kind_amount" }
  }

  throw new Error(error.message)
}

export function logDuplicateSettlementAttempt(params: {
  userId: string
  botSessionId: string
  settlementKind: TradeSessionSettlementKind
  amountUsd: number
  idempotencyKey: string
  source: string
}): void {
  console.warn("[trade-session-settlement] duplicate payout blocked", params)
}
