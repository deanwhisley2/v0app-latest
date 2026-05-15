import { roundUsd2 } from "@/lib/nexus-financial-policy"

/** 6.5% cashback on qualified deposits (exchange fee compensation). */
export const CRYPTO_COMPENSATION_RATE = 0.065

/** Minimum declared USD for compensation eligibility. */
export const CRYPTO_COMPENSATION_MIN_DECLARED_USD = 10

/** Declared amounts must be whole dollars on the 10,15,20,25,30 ladder (step 5 from 10). */
export const CRYPTO_COMPENSATION_ROUND_STEP = 5

const MAX_CHAIN_BEFORE_SUBMIT_MS = 6 * 60 * 60 * 1000
const MAX_CHAIN_AFTER_SUBMIT_MS = 30 * 60 * 1000

export type CryptoAmountAssessment = {
  principalUsd: number
  compensationUsd: number
  totalCreditUsd: number
  qualifiesCompensation: boolean
  autoApprove: boolean
  manualReviewReason: string | null
  mismatchNote: string | null
}

export function isQualifyingDeclaredAmount(declaredUsd: number): boolean {
  const d = roundUsd2(declaredUsd)
  if (d < CRYPTO_COMPENSATION_MIN_DECLARED_USD) return false
  const rounded = Math.round(d)
  if (Math.abs(d - rounded) > 0.02) return false
  return rounded >= CRYPTO_COMPENSATION_MIN_DECLARED_USD && rounded % CRYPTO_COMPENSATION_ROUND_STEP === 0
}

/** Fee-tolerant: received may be below declared (Binance/network fees), not far below or above. */
export function isFeeToleranceAcceptable(declaredUsd: number, receivedUsdt: number): boolean {
  const declared = roundUsd2(declaredUsd)
  const received = roundUsd2(receivedUsdt)
  if (!(declared > 0) || !(received > 0)) return false
  if (received > declared * 1.08) return false
  if (received < declared * 0.45) return false
  return true
}

export function assessCryptoDepositAmounts(
  declaredUsd: number,
  receivedUsdt: number,
): CryptoAmountAssessment {
  const declared = roundUsd2(declaredUsd)
  const received = roundUsd2(receivedUsdt)
  const principalUsd = received

  const feeOk = isFeeToleranceAcceptable(declared, received)
  const qualifiesCompensation =
    isQualifyingDeclaredAmount(declared) && feeOk && received >= CRYPTO_COMPENSATION_MIN_DECLARED_USD * 0.45

  const compensationUsd = qualifiesCompensation
    ? roundUsd2(principalUsd * CRYPTO_COMPENSATION_RATE)
    : 0
  const totalCreditUsd = roundUsd2(principalUsd + compensationUsd)

  let autoApprove = true
  let manualReviewReason: string | null = null
  let mismatchNote: string | null = null

  if (!(received > 0)) {
    autoApprove = false
    manualReviewReason = "No confirmed USDT amount on-chain."
  } else if (received > declared * 1.08) {
    autoApprove = false
    manualReviewReason = "Received amount exceeds declared beyond acceptable tolerance."
  } else if (received < declared * 0.45) {
    autoApprove = false
    manualReviewReason = "Received amount is far below declared — requires manual review."
  } else if (Math.abs(declared - received) > 0.01 && feeOk) {
    mismatchNote = `Declared ${declared.toFixed(2)} USD; chain received ${received.toFixed(2)} USDT (fee-tolerant auto-approve).`
  }

  return {
    principalUsd,
    compensationUsd,
    totalCreditUsd,
    qualifiesCompensation,
    autoApprove,
    manualReviewReason,
    mismatchNote,
  }
}

export function isChainTransferTimely(
  chainBlockTimestampMs: number | null | undefined,
  submittedAtIso: string,
): { ok: boolean; reason?: string } {
  if (!chainBlockTimestampMs || !(chainBlockTimestampMs > 0)) {
    return { ok: true }
  }
  const submitted = new Date(submittedAtIso).getTime()
  if (!Number.isFinite(submitted)) return { ok: true }
  if (chainBlockTimestampMs > Date.now() + 120_000) {
    return { ok: false, reason: "On-chain timestamp is in the future." }
  }
  if (submitted - chainBlockTimestampMs > MAX_CHAIN_BEFORE_SUBMIT_MS) {
    return { ok: false, reason: "Transaction is too old relative to when you submitted." }
  }
  if (chainBlockTimestampMs - submitted > MAX_CHAIN_AFTER_SUBMIT_MS) {
    return { ok: false, reason: "Transaction landed too long after submission." }
  }
  return { ok: true }
}

export const CRYPTO_COMPENSATION_USER_MESSAGE =
  "Nexus has successfully compensated part of your transaction fees by adding a 6.5% cashback bonus to your deposit."
