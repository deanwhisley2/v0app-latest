/**
 * Acceptance sanity for Batch 1 policy helpers (no DB).
 * Run: npm run nexus:financial-batch1-check
 */

import {
  computeEarlyExitSettlementUsd,
  computeFixedTradeMainDebitUsd,
  fixInsuranceAndWithdrawFees,
  roundUsd2,
  splitFixedTradeOpenCommitUsd,
  NEXUS_EMERGENCY_PULLOUT_THRESHOLD,
  NEXUS_FIXED_EARLY_EXIT_AGREEMENT_RATE,
  NEXUS_HARD_PROTECTION_THRESHOLD,
  NEXUS_MIN_DEPOSIT_USD,
  NEXUS_MIN_WITHDRAW_USD,
  NEXUS_REFERRAL_RATE_ON_FIRST_DEPOSIT,
} from "../lib/nexus-financial-policy"
import { minDepositUsdOk, minWithdrawUsdOk, readFxLocalPerUsdMap, usdToLocalUnits } from "../lib/nexus-fx"
import { parseCustomerLocalAmountInput } from "../lib/customer-amount-parse"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function main() {
  assert(NEXUS_MIN_DEPOSIT_USD === 5, "min deposit 5")
  assert(NEXUS_MIN_WITHDRAW_USD === 3.18, "min withdraw 3.18")
  assert(NEXUS_REFERRAL_RATE_ON_FIRST_DEPOSIT === 0.035, "referral 3.5%")
  assert(NEXUS_EMERGENCY_PULLOUT_THRESHOLD === 0.07, "emergency 7%")
  assert(NEXUS_HARD_PROTECTION_THRESHOLD === 0.09, "hard 9%")

  assert(minDepositUsdOk(5), "deposit edge ok")
  assert(!minDepositUsdOk(4.99), "deposit below min")
  assert(minWithdrawUsdOk(3.18), "withdraw edge ok")
  assert(!minWithdrawUsdOk(3), "withdraw below min")

  const l1Low = fixInsuranceAndWithdrawFees(1, "Low")
  assert(l1Low.insuranceFeeRate === 0.02 && l1Low.withdrawalFeeRate === 0.016, "L1 low fees")

  const l2Med = fixInsuranceAndWithdrawFees(2, "Medium")
  assert(l2Med.insuranceFeeRate === 0.035 && l2Med.withdrawalFeeRate === 0.015, "L2 medium fees")

  const split = splitFixedTradeOpenCommitUsd(1000, l2Med.insuranceFeeRate)
  assert(split.insuranceFeeUsd === 35, `insurance carved ${split.insuranceFeeUsd}`)
  assert(split.principalUsd === 965, `net principal ${split.principalUsd}`)
  const debit = computeFixedTradeMainDebitUsd(1000)
  assert(debit === 1000, `main debit equals gross commit ${debit}`)

  assert(NEXUS_FIXED_EARLY_EXIT_AGREEMENT_RATE === 0.1, "early exit 10%")
  const early = computeEarlyExitSettlementUsd(1000, 20, 150)
  assert(early.agreementPenaltyUsd === 100 && early.insuranceExitFromPrincipalUsd === 20, "penalties on principal")
  assert(early.sessionEarnedUsd === 150, "earned untouched in math")
  assert(early.netPrincipalReturnedUsd === 880 && early.totalCreditedToMainUsd === 1030, "credit = earned + net principal")

  const partialEarned = 150
  const priorReleased = 93.69
  const unreleased = roundUsd2(Math.max(0, partialEarned - priorReleased))
  const earlyPartial = computeEarlyExitSettlementUsd(1000, 20, unreleased)
  assert(earlyPartial.sessionEarnedUsd === unreleased, "early exit must use unreleased slice only")
  assert(
    earlyPartial.totalCreditedToMainUsd === roundUsd2(earlyPartial.netPrincipalReturnedUsd + unreleased),
    "no double-count of prior released gross",
  )

  readFxLocalPerUsdMap()
  const ugx = usdToLocalUnits(5, "UGX")
  if (process.env.NEXUS_FX_LOCAL_PER_USD_JSON?.includes("UGX")) {
    assert(ugx !== null && ugx > 0, "fx conversion when UGX configured")
  }

  assert(parseCustomerLocalAmountInput("1 519 199,50") === 1_519_199.5, "fr-CD decimal comma + spaces")
  assert(parseCustomerLocalAmountInput("1\u202f519\u202f199,50") === 1_519_199.5, "narrow no-break spaces")
  assert(parseCustomerLocalAmountInput("1,519,990") === 1_519_990, "US thousand commas")
  assert(parseCustomerLocalAmountInput("1519199.50") === 1_519_199.5, "plain dot decimal")
  assert(parseCustomerLocalAmountInput("1.519.199,50") === 1_519_199.5, "EU dot thousands + comma decimal")
  assert(parseCustomerLocalAmountInput("CDF 1 420 000") === 1_420_000, "CDF prefix + spaces")
  assert(parseCustomerLocalAmountInput("150,000.00") === 150_000, "US comma thousands + dot decimal")
  assert(parseCustomerLocalAmountInput("KSh 8,600.00") === 8_600, "KSh prefix")
  assert(parseCustomerLocalAmountInput("$66.50") === 66.5, "USD symbol")

  console.log("nexus-financial-batch1-check: OK")
}

main()
