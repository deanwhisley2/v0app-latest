/** Auto-trade plan keys — extend here (60d, VIP, institutional) without schema changes. */
export const NEXUS_AUTO_TRADE_PLAN_KEYS = [
  "auto_24h",
  "auto_7d",
  "auto_14d",
  "auto_30d",
] as const

export type NexusAutoTradePlanKey = (typeof NEXUS_AUTO_TRADE_PLAN_KEYS)[number]

export type NexusAutoTradePlan = {
  key: NexusAutoTradePlanKey
  label: string
  hours: number
}

export const NEXUS_AUTO_TRADE_PLANS: NexusAutoTradePlan[] = [
  { key: "auto_24h", label: "Auto 24 Hours", hours: 24 },
  { key: "auto_7d", label: "Auto 7 Days", hours: 24 * 7 },
  { key: "auto_14d", label: "Auto 14 Days", hours: 24 * 14 },
  { key: "auto_30d", label: "Auto 30 Days", hours: 24 * 30 },
]

export function isNexusAutoTradePlanKey(v: string): v is NexusAutoTradePlanKey {
  return (NEXUS_AUTO_TRADE_PLAN_KEYS as readonly string[]).includes(v)
}

export function planByKey(key: string): NexusAutoTradePlan | null {
  return NEXUS_AUTO_TRADE_PLANS.find((p) => p.key === key) ?? null
}

/** Signal session stake tiers (USD ledger). */
export const NEXUS_SIGNAL_STAKE_TIERS_USD = [10, 50, 100] as const

export type NexusSignalSlot = "morning" | "evening"

export function normalizeSignalCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "")
}
