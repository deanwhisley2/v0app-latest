/** Minimum length after normalization for mobile-money / bank references. */
export const FUNDING_PAYMENT_REF_MIN_LEN = 4

const CRYPTO_TX_HEX = /^[a-f0-9]{64}$/

/** Normalize payment references for global uniqueness (case, spacing, punctuation). */
export function normalizeFundingPaymentReference(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim()
  if (!trimmed) return null

  const compactLower = trimmed.toLowerCase().replace(/\s+/g, "")
  if (CRYPTO_TX_HEX.test(compactLower)) return compactLower

  const alnum = trimmed.replace(/\s+/g, "").replace(/[^0-9A-Za-z]/g, "").toUpperCase()
  return alnum.length > 0 ? alnum : null
}

export function fundingReferenceKind(normalized: string): "crypto_tx" | "payment_ref" {
  return CRYPTO_TX_HEX.test(normalized) ? "crypto_tx" : "payment_ref"
}

export function isFundingReferenceFormatValid(normalized: string | null): boolean {
  if (!normalized) return false
  if (CRYPTO_TX_HEX.test(normalized)) return true
  return normalized.length >= FUNDING_PAYMENT_REF_MIN_LEN
}
