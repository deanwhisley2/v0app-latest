export type UserLevelNum = 1 | 2 | 3 | 4 | 5

export type FixTradeRiskLevel = "Low" | "Medium" | "High"

export type FixedTradeEligibilityOpts = {
  /** Launch-window starter desk (Low risk only). */
  launchStarterDesk?: boolean
}

export type ContainerLaunchEligibility = {
  promotionsActive?: boolean
  starterFixUnlock?: boolean
  starterFixPersonaId?: string
}

export function isLaunchStarterFixPersona(
  launch: ContainerLaunchEligibility | null | undefined,
  personaId: string,
): boolean {
  if (!launch?.promotionsActive || !launch.starterFixUnlock) return false
  const id = (launch.starterFixPersonaId ?? "fix_l1_t1").trim()
  return personaId === id
}

/** Client + server aligned fixed-desk eligibility (includes launch starter unlock). */
export function traderFixedDeskEligible(
  userLevel: UserLevelNum | number,
  riskLevel: FixTradeRiskLevel,
  launch: ContainerLaunchEligibility | null | undefined,
  personaId: string,
): boolean {
  return traderEligibleForFixedTrade(userLevel, riskLevel, {
    launchStarterDesk: isLaunchStarterFixPersona(launch, personaId),
  })
}

/** Fixed-trade desk: L1 → Low only; L2 → Low + Medium; L3+ → all tiers. */
export function traderEligibleForFixedTrade(
  userLevel: UserLevelNum | number,
  riskLevel: FixTradeRiskLevel,
  opts?: FixedTradeEligibilityOpts,
): boolean {
  if (opts?.launchStarterDesk) return riskLevel === "Low"
  const lv = Number(userLevel)
  if (lv <= 1) return riskLevel === "Low"
  if (lv === 2) return riskLevel === "Low" || riskLevel === "Medium"
  return true
}

export function fixedTradeTierHint(userLevel: UserLevelNum | number): string {
  const lv = Number(userLevel)
  if (lv <= 1) return "Level 1: Low risk traders only."
  if (lv === 2) return "Level 2: Low and Medium risk."
  return "Level 3+: Low, Medium, and High risk."
}
