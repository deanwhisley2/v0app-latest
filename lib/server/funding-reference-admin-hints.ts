import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeFundingPaymentReference } from "@/lib/server/funding-reference-normalize"

export type FundingReferenceAdminHint = {
  /** Short ops hint for operations desk duplicate_risk_hint column. */
  hint: string
  reuseAttemptCount: number
  registryUserId: string | null
  registrySourceTable: string | null
  registrySourceId: string | null
  registryStatus: string | null
}

/** Load global reference reuse signals for admin operations desk rows. */
export async function loadFundingReferenceAdminHints(
  admin: SupabaseClient,
  rawReferences: string[],
): Promise<Map<string, FundingReferenceAdminHint>> {
  const out = new Map<string, FundingReferenceAdminHint>()
  const normalizedList = [
    ...new Set(
      rawReferences
        .map((r) => normalizeFundingPaymentReference(r))
        .filter((n): n is string => Boolean(n)),
    ),
  ]
  if (normalizedList.length === 0) return out

  const [registryRes, eventsRes] = await Promise.all([
    admin
      .from("funding_payment_reference_registry")
      .select("reference_normalized,user_id,source_table,source_id,status_snapshot")
      .in("reference_normalized", normalizedList),
    admin
      .from("funding_reference_security_events")
      .select("reference_normalized")
      .in("reference_normalized", normalizedList)
      .eq("event_kind", "reuse_attempt"),
  ])

  if (registryRes.error) throw new Error(registryRes.error.message)
  if (eventsRes.error) throw new Error(eventsRes.error.message)

  const reuseCounts = new Map<string, number>()
  for (const ev of eventsRes.data ?? []) {
    const key = String((ev as { reference_normalized: string }).reference_normalized)
    reuseCounts.set(key, (reuseCounts.get(key) ?? 0) + 1)
  }

  for (const row of registryRes.data ?? []) {
    const norm = String((row as { reference_normalized: string }).reference_normalized)
    const attempts = reuseCounts.get(norm) ?? 0
    const owner = String((row as { user_id: string }).user_id)
    const table = String((row as { source_table: string }).source_table)
    const sourceId = String((row as { source_id: string }).source_id)
    const status = String((row as { status_snapshot: string }).status_snapshot ?? "")
    const parts: string[] = ["Global payment ref locked"]
    if (attempts > 0) parts.push(`${attempts} reuse attempt(s)`)
    parts.push(`orig user ${owner.slice(0, 8)}… · ${table} · ${status}`)
    out.set(norm, {
      hint: parts.join(" · "),
      reuseAttemptCount: attempts,
      registryUserId: owner,
      registrySourceTable: table,
      registrySourceId: sourceId,
      registryStatus: status,
    })
  }

  for (const norm of normalizedList) {
    if (out.has(norm)) continue
    const attempts = reuseCounts.get(norm) ?? 0
    if (attempts > 0) {
      out.set(norm, {
        hint: `${attempts} reuse attempt(s) on reference (no registry row yet)`,
        reuseAttemptCount: attempts,
        registryUserId: null,
        registrySourceTable: null,
        registrySourceId: null,
        registryStatus: null,
      })
    }
  }

  return out
}

export function mergeOpsDuplicateHint(
  channelHint: string | null,
  refHint: FundingReferenceAdminHint | null,
): string | null {
  if (!channelHint && !refHint) return null
  if (channelHint && refHint) return `${channelHint} | ${refHint.hint}`
  return channelHint ?? refHint?.hint ?? null
}
