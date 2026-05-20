/**
 * Parse customer-entered money strings (all corridors).
 * Ledger/accounting stays USD-normalized; this only normalizes human input.
 */

/** Strip NBSP, narrow no-break space, thin space, etc. */
export const GROUPING_SPACE_RE = /[\s\u00a0\u202f\u2009]/g

/** Known fiat tickers and symbols (longest first). */
const CURRENCY_PREFIX_RE =
  /\b(?:CDF|UGX|USD|USDT|KES|TZS|RWF|NGN|GHS|ZAR|XOF|XAF|CFA|MAD|EGP|ETB|ZMW|MWK|MZN|BWP|SDG|KSH|FC)\b/gi

const SYMBOL_CHARS_RE = /[$€£₦₹¥]/g

/**
 * Parse a localized amount string to a finite number (local fiat units, not USD).
 * Accepts: 150000, 150,000, 150 000, 150 000,50, 150.000, CDF 1 420 000, $66.50, KSh 8,600.00
 */
export function parseCustomerLocalAmountInput(raw: string): number {
  let s = raw.normalize("NFKC").trim()
  if (!s) return NaN

  s = s.replace(CURRENCY_PREFIX_RE, " ")
  s = s.replace(SYMBOL_CHARS_RE, "")
  s = s.replace(/[^\d.,\s\u00a0\u202f\u2009+-]/g, " ")
  s = s.trim()
  if (!s) return NaN

  const sign = s.startsWith("-") ? -1 : 1
  s = s.replace(/^[+-]/, "").trim()

  const commaCount = (s.match(/,/g) ?? []).length
  const dotCount = (s.match(/\./g) ?? []).length

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = s.lastIndexOf(",")
    const lastDot = s.lastIndexOf(".")
    if (lastComma > lastDot) {
      s = s.replace(GROUPING_SPACE_RE, "").replace(/\./g, "").replace(",", ".")
    } else {
      s = s.replace(GROUPING_SPACE_RE, "").replace(/,/g, "")
    }
  } else if (commaCount === 1) {
    const compact = s.replace(GROUPING_SPACE_RE, "")
    const idx = compact.indexOf(",")
    const intPart = compact.slice(0, idx)
    const fracPart = compact.slice(idx + 1)
    if (/^\d{1,2}$/.test(fracPart)) {
      s = `${intPart}.${fracPart}`
    } else {
      s = compact.replace(/,/g, "")
    }
  } else if (commaCount > 1) {
    s = s.replace(GROUPING_SPACE_RE, "").replace(/,/g, "")
  } else if (dotCount > 1) {
    const compact = s.replace(GROUPING_SPACE_RE, "")
    const lastDot = compact.lastIndexOf(".")
    const after = compact.slice(lastDot + 1)
    if (/^\d{1,2}$/.test(after)) {
      s = compact.slice(0, lastDot).replace(/\./g, "") + "." + after
    } else {
      s = compact.replace(/\./g, "")
    }
  } else if (dotCount === 1) {
    const compact = s.replace(GROUPING_SPACE_RE, "")
    const idx = compact.indexOf(".")
    const fracPart = compact.slice(idx + 1)
    if (/^\d{3}$/.test(fracPart)) {
      s = compact.replace(/\./g, "")
    } else {
      s = compact
    }
  } else {
    s = s.replace(GROUPING_SPACE_RE, "")
  }

  const n = Number.parseFloat(s)
  if (!Number.isFinite(n)) return NaN
  return sign * n
}
