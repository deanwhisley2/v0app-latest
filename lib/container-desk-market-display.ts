/** Desk card growth labels — copy vs fixed use different presentation (not identical). */

export function copyEstimatedGrowthPct(monthlyReturnPct: number): number {
  return Math.round(monthlyReturnPct * 1.55 * 10) / 10
}

export function fixEstimatedGrowthPct(monthlyReturnPct: number): number {
  return Math.round(monthlyReturnPct * 0.72 * 10) / 10
}

export const COPY_TRADER_INITIAL_ACCESS = 2
