import { roundUsd2, WITHDRAWAL_PROCESSING_FEE_RATE } from "@/lib/nexus-financial-policy"

export { WITHDRAWAL_PROCESSING_FEE_RATE }

export type WithdrawalProcessingSettlement = {
  /** Amount frozen from user Nexus Main (request amount). */
  grossAmount: number
  processingFeeAmount: number
  /** Amount operators forward to payout handlers after approval. */
  payoutAmount: number
  processingFeeRate: number
}

/** Server-authoritative 3% processing fee on cashout requests. */
export function computeWithdrawalProcessingSettlement(grossAmount: number): WithdrawalProcessingSettlement {
  const gross = roundUsd2(grossAmount)
  if (!(gross > 0)) {
    throw new Error("Withdrawal amount must be greater than zero.")
  }
  const rate = WITHDRAWAL_PROCESSING_FEE_RATE
  const processingFeeAmount = roundUsd2(gross * rate)
  const payoutAmount = roundUsd2(gross - processingFeeAmount)
  return {
    grossAmount: gross,
    processingFeeAmount,
    payoutAmount,
    processingFeeRate: rate,
  }
}

export type WithdrawalRequestFeeRow = {
  amount: number | string
  processing_fee_amount?: number | string | null
  payout_amount?: number | string | null
  processing_fee_rate?: number | string | null
}

/** Resolve persisted settlement; legacy rows have no fee (payout = gross). */
export function resolveWithdrawalSettlementFromRow(
  row: WithdrawalRequestFeeRow,
): WithdrawalProcessingSettlement & { legacyNoProcessingFee: boolean } {
  const gross = roundUsd2(Number(row.amount ?? 0))
  const payoutRaw = row.payout_amount
  const feeRaw = row.processing_fee_amount
  const rateRaw = row.processing_fee_rate

  if (payoutRaw != null && feeRaw != null && Number.isFinite(Number(payoutRaw))) {
    const payoutAmount = roundUsd2(Number(payoutRaw))
    const processingFeeAmount = roundUsd2(Number(feeRaw))
    const legacyNoProcessingFee =
      rateRaw == null && processingFeeAmount === 0 && Math.abs(payoutAmount - gross) < 0.005
    return {
      grossAmount: gross,
      processingFeeAmount,
      payoutAmount,
      processingFeeRate:
        rateRaw != null && Number.isFinite(Number(rateRaw))
          ? Number(rateRaw)
          : legacyNoProcessingFee
            ? 0
            : WITHDRAWAL_PROCESSING_FEE_RATE,
      legacyNoProcessingFee,
    }
  }

  if (rateRaw != null && Number(rateRaw) > 0) {
    const settled = computeWithdrawalProcessingSettlement(gross)
    return { ...settled, legacyNoProcessingFee: false }
  }

  return {
    grossAmount: gross,
    processingFeeAmount: 0,
    payoutAmount: gross,
    processingFeeRate: 0,
    legacyNoProcessingFee: true,
  }
}

export function assertWithdrawalSettlementConserved(settlement: WithdrawalProcessingSettlement): void {
  const sum = roundUsd2(settlement.payoutAmount + settlement.processingFeeAmount)
  if (Math.abs(sum - settlement.grossAmount) > 0.01) {
    throw new Error("Withdrawal settlement does not conserve gross = payout + fee.")
  }
}
