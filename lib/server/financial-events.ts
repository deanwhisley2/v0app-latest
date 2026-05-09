import { createAdminClient } from "@/lib/supabaseAdmin"

export type FinancialEventInput = {
  userId: string
  eventType: string
  category:
    | "funding"
    | "container"
    | "cashout"
    | "internal_transfer"
    | "trade"
    | "admin"
    | "system"
  amount?: number
  balanceSource?: string | null
  balanceDestination?: string | null
  feeAmount?: number
  status?: "pending" | "approved" | "rejected" | "completed" | "blocked"
  transactionRef?: string | null
  relatedSessionId?: string | null
  relatedTradeId?: string | null
  relatedContainerId?: string | null
  actorType?: "user" | "admin" | "system" | "bot" | "retailer"
  actorId?: string | null
  summary: string
  metadata?: Record<string, unknown>
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function recordFinancialEvent(input: FinancialEventInput) {
  const admin = createAdminClient()
  const payload = {
    user_id: input.userId,
    event_type: input.eventType,
    category: input.category,
    gross_amount: round2(Number(input.amount ?? 0)),
    net_amount: round2(Number(input.amount ?? 0) - Number(input.feeAmount ?? 0)),
    fee_amount: round2(Number(input.feeAmount ?? 0)),
    balance_source: input.balanceSource ?? null,
    balance_destination: input.balanceDestination ?? null,
    status: input.status ?? "completed",
    transaction_ref: input.transactionRef ?? crypto.randomUUID(),
    related_session_id: input.relatedSessionId ?? null,
    related_trade_id: input.relatedTradeId ?? null,
    related_container_id: input.relatedContainerId ?? null,
    actor_type: input.actorType ?? "system",
    actor_id: input.actorId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
  }

  const { data, error } = await admin
    .from("container_balance_events")
    .insert(payload)
    .select("id,created_at,transaction_ref")
    .single()

  if (error) {
    console.warn("[financial-events] insert failed:", error.message)
    return null
  }
  return data
}
