/** profiles.nexus_exchange_balances_snapshot — exchange-derived totals (no API secrets). */

export type NexusExchangeBalancesSnapshotV1 = {
  v: 1
  updatedAt: string
  totalUsd: number
  exchanges: Array<{
    id: string
    totalUsd: number
    error?: string | null
    lastSync?: string | null
  }>
}

export function coerceExchangeBalancesSnapshot(raw: unknown): NexusExchangeBalancesSnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return null
  if (typeof o.updatedAt !== "string") return null
  const totalUsd = Number(o.totalUsd)
  if (!Number.isFinite(totalUsd) || totalUsd < 0) return null
  if (!Array.isArray(o.exchanges)) return null
  const exchanges: NexusExchangeBalancesSnapshotV1["exchanges"] = []
  for (const row of o.exchanges) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    if (typeof r.id !== "string" || !r.id.trim()) continue
    const tu = Number(r.totalUsd)
    if (!Number.isFinite(tu) || tu < 0) continue
    exchanges.push({
      id: r.id.trim(),
      totalUsd: tu,
      error: typeof r.error === "string" ? r.error : r.error == null ? null : String(r.error),
      lastSync:
        typeof r.lastSync === "string" ? r.lastSync : r.lastSync == null ? null : String(r.lastSync),
    })
  }
  return { v: 1, updatedAt: o.updatedAt, totalUsd, exchanges }
}
