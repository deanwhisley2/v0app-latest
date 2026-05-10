import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

/** Lightweight in-app inbox row for approvals (reuses NotificationRecord schema). */
export async function notifyUserFundingDecision(
  sb: SupabaseClient,
  params: {
    userId: string
    headline: string
    relatedId: string
  },
): Promise<void> {
  const nowIso = new Date().toISOString()
  try {
    const { error } = await sb.from("NotificationRecord").insert({
      id: randomUUID(),
      userId: params.userId,
      analysisId: params.relatedId,
      symbol: "NEXUS_OPS",
      action: params.headline.slice(0, 120),
      confidence: 0,
      read: false,
      deleted: false,
      createdAt: nowIso,
    })
    if (error) console.warn("[approval-inbox-notify]", error.message)
  } catch (e) {
    console.warn("[approval-inbox-notify]", e)
  }
}
