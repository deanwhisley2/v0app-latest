/** Classify `failure_reason` for UI — some rows store fee-tolerance notes, not errors. */
export function classifyCryptoDepositReason(
  status: string,
  reason: string | null | undefined,
): "none" | "info" | "error" {
  const r = reason?.trim()
  if (!r) return "none"
  const st = status.toLowerCase()
  const progressing = ["awaiting_confirmations", "verified", "verifying", "pending"].includes(st)
  const feeNote =
    /fee-tolerant/i.test(r) || /auto-approve/i.test(r) || /chain received/i.test(r)
  if (feeNote && progressing) return "info"
  if (st === "credited" && feeNote) return "info"
  return "error"
}

export function cryptoDepositFeeToleranceNote(declaredUsd: number, receivedUsdt: number): string | null {
  if (!(declaredUsd > 0) || !(receivedUsdt > 0)) return null
  if (Math.abs(declaredUsd - receivedUsdt) <= 0.01) return null
  return `Declared ${declaredUsd.toFixed(2)} USD; received ${receivedUsdt.toFixed(2)} USDT on-chain (fee-tolerant — credit uses received amount).`
}
