import type { SupabaseClient } from "@supabase/supabase-js"

/** Canonical stream kinds for settlement / treasury analytics (immutable append-only DB rows). */
export type TreasuryOperationStreamEventType =
  | "funding_created"
  | "fx_normalized"
  | "approval_requested"
  | "treasury_debited"
  | "customer_credited"
  | "compensation_applied"
  | "notification_sent"
  | "risk_flag"
  | "reconciliation_completed"
  | "automation_safe_mode_block"

export function fundRequestReferenceId(fundRequestId: string): string {
  return `fund_req:${fundRequestId.trim()}`
}

export function parseFundRequestIdFromDebitReference(referenceId: string): string | null {
  const s = referenceId.trim()
  const prefix = "fund_req:"
  if (!s.startsWith(prefix)) return null
  const id = s.slice(prefix.length).trim()
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

/**
 * Emit a pipeline event. Never throws to callers — observability must not block settlement critical path.
 */
export async function emitTreasuryStreamEvent(
  admin: SupabaseClient,
  params: {
    eventType: TreasuryOperationStreamEventType
    payload: Record<string, unknown>
    fundRequestId?: string | null
    userId?: string | null
    cryptoDepositId?: string | null
    correlationId?: string | null
  },
): Promise<void> {
  try {
    const { error } = await admin.from("treasury_operation_stream").insert({
      event_type: params.eventType,
      payload: params.payload,
      fund_request_id: params.fundRequestId ?? null,
      user_id: params.userId ?? null,
      crypto_deposit_id: params.cryptoDepositId ?? null,
      correlation_id: params.correlationId ?? null,
    })
    if (error) console.warn("[treasury-operation-stream]", error.message)
  } catch (e) {
    console.warn("[treasury-operation-stream]", e)
  }
}
