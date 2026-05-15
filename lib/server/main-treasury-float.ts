import { treasury } from "@/lib/financial/treasury-authority"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

/**
 * MAIN_TREASURY (treasury_balances) is the only company USD pool for crypto credits and L5 approvals.
 * Legacy admin_treasury_pool is retired — never debit or display it as a second treasury.
 */
export async function ensureMainTreasuryCanCoverDebit(debitUsd: number): Promise<number> {
  const need = roundUsd2(debitUsd)
  if (!(need > 0)) throw new Error("Invalid debit amount.")

  const current = await treasury.getTreasuryBalance("MAIN_TREASURY")
  if (current < need) {
    throw new Error(
      `Company treasury is too low to credit $${need.toFixed(2)} (MAIN_TREASURY has $${current.toFixed(2)}). Level 5 admin must fund the treasury pool.`,
    )
  }
  return current
}
