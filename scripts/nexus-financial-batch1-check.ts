/**
 * Acceptance sanity for Batch 1 policy helpers (no DB).
 * Run: npm run nexus:financial-batch1-check
 */

import {
  computeEarlyExitSettlementUsd,
  computeFixedTradeMainDebitUsd,
  computeInsuranceFeeUsd,
  fixInsuranceAndWithdrawFees,
  NEXUS_EMERGENCY_PULLOUT_THRESHOLD,
  NEXUS_FIXED_EARLY_EXIT_AGREEMENT_RATE,
  NEXUS_HARD_PROTECTION_THRESHOLD,
  NEXUS_MIN_DEPOSIT_USD,
  NEXUS_MIN_WITHDRAW_USD,
  NEXUS_REFERRAL_RATE_ON_FIRST_DEPOSIT,
} from "../lib/nexus-financial-policy"
import { minDepositUsdOk, minWithdrawUsdOk, readFxLocalPerUsdMap, usdToLocalUnits } from "../lib/nexus-fx"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function main() {
  assert(NEXUS_MIN_DEPOSIT_USD === 5, "min deposit 5")
  assert(NEXUS_MIN_WITHDRAW_USD === 3, "min withdraw 3")
  assert(NEXUS_REFERRAL_RATE_ON_FIRST_DEPOSIT === 0.035, "referral 3.5%")
  assert(NEXUS_EMERGENCY_PULLOUT_THRESHOLD === 0.07, "emergency 7%")
  assert(NEXUS_HARD_PROTECTION_THRESHOLD === 0.09, "hard 9%")

  assert(minDepositUsdOk(5), "deposit edge ok")
  assert(!minDepositUsdOk(4.99), "deposit below min")
  assert(minWithdrawUsdOk(3), "withdraw edge ok")
  assert(!minWithdrawUsdOk(2.5), "withdraw below min")

  const l1Low = fixInsuranceAndWithdrawFees(1, "Low")
  assert(l1Low.insuranceFeeRate === 0.02 && l1Low.withdrawalFeeRate === 0.016, "L1 low fees")

  const l2Med = fixInsuranceAndWithdrawFees(2, "Medium")
  assert(l2Med.insuranceFeeRate === 0.035 && l2Med.withdrawalFeeRate === 0.015, "L2 medium fees")

  const ins = computeInsuranceFeeUsd(1000, l2Med.insuranceFeeRate)
  assert(ins === 35, `insurance fee ${ins}`)
  const debit = computeFixedTradeMainDebitUsd(1000, ins)
  assert(debit === 1035, `main debit ${debit}`)

  assert(NEXUS_FIXED_EARLY_EXIT_AGREEMENT_RATE === 0.1, "early exit 10%")
  const early = computeEarlyExitSettlementUsd(1000, 20, 150)
  assert(early.agreementPenaltyUsd === 100 && early.insuranceExitFromPrincipalUsd === 20, "penalties on principal")
  assert(early.sessionEarnedUsd === 150, "earned untouched in math")
  assert(early.netPrincipalReturnedUsd === 880 && early.totalCreditedToMainUsd === 1030, "credit = earned + net principal")

  readFxLocalPerUsdMap()
  const ugx = usdToLocalUnits(5, "UGX")
  if (process.env.NEXUS_FX_LOCAL_PER_USD_JSON?.includes("UGX")) {
    assert(ugx !== null && ugx > 0, "fx conversion when UGX configured")
  }

  console.log("nexus-financial-batch1-check: OK")
}

main()
