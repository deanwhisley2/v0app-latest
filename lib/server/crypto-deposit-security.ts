import type { SupabaseClient } from "@supabase/supabase-js"

export type CryptoSecurityEventKind =
  | "duplicate_tx_hash"
  | "duplicate_tx_other_user"
  | "compensation_farming_suspect"
  | "unrealistic_mismatch"
  | "stale_chain_tx"
  | "tx_hash_reuse_attempt"

export async function logCryptoDepositSecurityEvent(
  admin: SupabaseClient,
  event: {
    userId?: string | null
    depositRequestId?: string | null
    eventKind: CryptoSecurityEventKind
    severity?: "info" | "warning" | "critical"
    txHash?: string | null
    message?: string
    details?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await admin.from("crypto_deposit_security_events").insert({
    user_id: event.userId ?? null,
    deposit_request_id: event.depositRequestId ?? null,
    event_kind: event.eventKind,
    severity: event.severity ?? "warning",
    tx_hash: event.txHash?.trim().toLowerCase() ?? null,
    message: event.message ?? null,
    details: event.details ?? null,
  })
  if (error) console.error("[crypto-deposit-security]", error.message)
}

export async function countRecentCompensationCredits(
  admin: SupabaseClient,
  userId: string,
  hours = 24,
): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const { count, error } = await admin
    .from("crypto_deposit_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "credited")
    .gt("compensation_usd", 0)
    .gte("credited_at", since)
  if (error) return 0
  return count ?? 0
}
