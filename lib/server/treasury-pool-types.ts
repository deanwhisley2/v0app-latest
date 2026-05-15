/** Company USD pools in `treasury_balances` (Level 5 manages two). */
export const TREASURY_POOL_AUTO_APPROVAL = "MAIN_TREASURY" as const
export const TREASURY_POOL_RESERVE = "OPERATIONAL" as const

export type TreasuryPoolWallet =
  | typeof TREASURY_POOL_AUTO_APPROVAL
  | typeof TREASURY_POOL_RESERVE

export const L5_TREASURY_POOLS: TreasuryPoolWallet[] = [
  TREASURY_POOL_AUTO_APPROVAL,
  TREASURY_POOL_RESERVE,
]

export function isTreasuryPoolWallet(v: string): v is TreasuryPoolWallet {
  return L5_TREASURY_POOLS.includes(v as TreasuryPoolWallet)
}

export function treasuryPoolLabel(pool: TreasuryPoolWallet): string {
  if (pool === TREASURY_POOL_AUTO_APPROVAL) return "Auto-approval float"
  return "Treasury reserve"
}
