import assert from "node:assert/strict"
import {
  assertWithdrawalSettlementConserved,
  computeWithdrawalProcessingSettlement,
  resolveWithdrawalSettlementFromRow,
} from "../lib/server/withdrawal-processing-fee"
import { WITHDRAWAL_PROCESSING_FEE_RATE } from "../lib/nexus-financial-policy"

assert.equal(WITHDRAWAL_PROCESSING_FEE_RATE, 0.03)

const s100 = computeWithdrawalProcessingSettlement(100)
assert.equal(s100.grossAmount, 100)
assert.equal(s100.processingFeeAmount, 3)
assert.equal(s100.payoutAmount, 97)
assertWithdrawalSettlementConserved(s100)

const sUg = computeWithdrawalProcessingSettlement(33.33)
assert.equal(sUg.processingFeeAmount, 1)
assert.equal(sUg.payoutAmount, 32.33)
assertWithdrawalSettlementConserved(sUg)

const legacy = resolveWithdrawalSettlementFromRow({
  amount: 50,
  processing_fee_amount: 0,
  payout_amount: 50,
  processing_fee_rate: null,
})
assert.equal(legacy.legacyNoProcessingFee, true)
assert.equal(legacy.payoutAmount, 50)

const modern = resolveWithdrawalSettlementFromRow({
  amount: 100,
  processing_fee_amount: 3,
  payout_amount: 97,
  processing_fee_rate: 0.03,
})
assert.equal(modern.legacyNoProcessingFee, false)
assert.equal(modern.payoutAmount, 97)

console.log("withdrawal-processing-fee: PASS")
