/**
 * Dual-currency withdrawal display for ops desk and receipts.
 * Ledger columns remain USD; local leg is user intent only.
 */

import { formatLocalFundingAmount } from "@/lib/formatting/funding-amount-display"

export type WithdrawalAmountDisplayInput = {
  grossUsd: number
  processingFeeUsd?: number | null
  payoutUsd?: number | null
  feeRate?: number | null
  amountInputLocal?: number | null
  inputCurrency?: string | null
}

export type WithdrawalAmountDisplayLines = {
  grossPrimary: string
  feeLine: string | null
  payoutLine: string | null
  intentLine: string | null
}

function num(v: unknown): number {
  const n = Number(v ?? NaN)
  return Number.isFinite(n) ? n : NaN
}

function fmtUsd(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function parseWithdrawalIntentFromRow(row: {
  amount_input_local?: unknown
  input_currency?: unknown
  metadata?: unknown
}): { amountInputLocal: number | null; inputCurrency: string | null } {
  let local = num(row.amount_input_local)
  let ccy = String(row.input_currency ?? "")
    .trim()
    .toUpperCase()
  if (!(local > 0) && row.metadata && typeof row.metadata === "object") {
    const intent = (row.metadata as Record<string, unknown>).request_intent
    if (intent && typeof intent === "object") {
      const o = intent as Record<string, unknown>
      local = num(o.amount_input_local)
      ccy = String(o.input_currency ?? ccy)
        .trim()
        .toUpperCase()
    }
  }
  if (!(local > 0) || ccy.length < 3) {
    return { amountInputLocal: null, inputCurrency: null }
  }
  return { amountInputLocal: local, inputCurrency: ccy }
}

export function formatWithdrawalAmountDisplay(
  input: WithdrawalAmountDisplayInput,
): WithdrawalAmountDisplayLines {
  const gross = num(input.grossUsd)
  const fee = num(input.processingFeeUsd ?? 0)
  const payout = num(input.payoutUsd ?? gross)
  const local = num(input.amountInputLocal)
  const ccy = String(input.inputCurrency ?? "")
    .trim()
    .toUpperCase()
  const hasIntent = local > 0 && ccy.length >= 3

  const grossPrimary = Number.isFinite(gross) ? `$${fmtUsd(gross)}` : "—"
  const feeLine =
    Number.isFinite(fee) && fee > 0
      ? `Fee $${fmtUsd(fee)}${
          input.feeRate != null && input.feeRate > 0
            ? ` (${(Number(input.feeRate) * 100).toFixed(1)}%)`
            : ""
        }`
      : null
  const payoutLine = Number.isFinite(payout) ? `Payout $${fmtUsd(payout)}` : null
  const intentLine = hasIntent ? `Intent: ${formatLocalFundingAmount(local, ccy)}` : null

  return { grossPrimary, feeLine, payoutLine, intentLine }
}

/** Single-line label for compact receipts (customer / retailer lists). */
export function formatWithdrawalReceiptCompact(input: WithdrawalAmountDisplayInput): string {
  const lines = formatWithdrawalAmountDisplay(input)
  const parts: string[] = []
  const local = num(input.amountInputLocal)
  const ccy = String(input.inputCurrency ?? "").trim()
  if (local > 0 && ccy.length >= 3) {
    parts.push(formatLocalFundingAmount(local, ccy))
  }
  if (Number.isFinite(num(input.grossUsd)) && num(input.grossUsd) > 0) {
    parts.push(`≈ $${fmtUsd(num(input.grossUsd))} USD`)
  }
  return parts.length ? parts.join(" · ") : lines.grossPrimary
}
