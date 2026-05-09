export type UserLevelNum = 1 | 2 | 3 | 4 | 5

export type FixTradeRiskLevel = "Low" | "Medium" | "High"

/** Fixed-trade desk: L1 → Low only; L2 → Low + Medium; L3+ → all tiers. */
export function traderEligibleForFixedTrade(
  userLevel: UserLevelNum | number,
  riskLevel: FixTradeRiskLevel
): boolean {
  const lv = Number(userLevel)
  if (lv <= 1) return riskLevel === "Low"
  if (lv === 2) return riskLevel === "Low" || riskLevel === "Medium"
  return true
}

export function fixedTradeTierHint(userLevel: UserLevelNum | number): string {
  const lv = Number(userLevel)
  if (lv <= 1) return "Level 1: you can lock funds only on traders marked Low risk."
  if (lv === 2) return "Level 2: you can fix on Low and Medium risk traders."
  return "Fix trade: Low, Medium, and High risk traders."
}
