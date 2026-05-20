/**
 * Live amount field formatting while typing (grouping + locale decimal rules).
 * Validation still uses parseCustomerLocalAmountInput → numeric value.
 */
import { GROUPING_SPACE_RE, parseCustomerLocalAmountInput } from "@/lib/customer-amount-parse"
import { fiatDecimalPlaces } from "@/lib/customer-facing-money"

function decimalSeparatorForLocale(locale: string): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1)
  return parts.find((p) => p.type === "decimal")?.value ?? "."
}

function groupingSeparatorForLocale(locale: string): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1000)
  return parts.find((p) => p.type === "group")?.value ?? ","
}

function numberFormatter(locale: string, maxFractionDigits: number): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  })
}

/** Detect user trailing decimal separator (incomplete fraction while typing). */
function trailingDecimalState(raw: string): { hasTrailing: boolean; sep: string } {
  const s = raw.normalize("NFKC").trimEnd()
  const m = s.match(/([.,])\s*$/)
  if (!m) return { hasTrailing: false, sep: "," }
  return { hasTrailing: true, sep: m[1] }
}

/**
 * Format amount for controlled text inputs as the user types.
 * Preserves an in-progress trailing decimal separator (e.g. `150 000,`).
 */
export function formatAmountInputLive(raw: string, locale: string, currency: string): string {
  const trimmed = raw.normalize("NFKC")
  if (!trimmed.trim()) return ""

  const maxFrac = fiatDecimalPlaces(currency)
  const nf = numberFormatter(locale || "en-US", maxFrac)
  const defaultDecSep = decimalSeparatorForLocale(locale || "en-US")
  const { hasTrailing, sep: trailingSep } = trailingDecimalState(trimmed)

  const parsed = parseCustomerLocalAmountInput(trimmed)
  if (!Number.isFinite(parsed)) {
    const digits = trimmed.replace(/[^\d]/g, "")
    if (!digits) {
      return trimmed.replace(/[^\d.,\s\u00a0\u202f\u2009+-]/g, "").slice(0, 32)
    }
    const n = Number.parseInt(digits, 10)
    if (!Number.isFinite(n)) return trimmed
    const sign = trimmed.trimStart().startsWith("-") ? "-" : ""
    return sign + nf.format(Math.abs(n))
  }

  if (hasTrailing && maxFrac > 0) {
    const intOnly = Math.trunc(Math.abs(parsed))
    const sign = parsed < 0 ? "-" : ""
    const grouped = nf.format(intOnly)
    const decSep = trailingSep === "," || trailingSep === "." ? trailingSep : defaultDecSep
    return `${sign}${grouped}${decSep}`
  }

  return nf.format(parsed)
}

/** Numeric value from a formatted input string (for validation / submit). */
export function numericFromAmountInput(raw: string): number {
  return parseCustomerLocalAmountInput(raw)
}

/** Strip display formatting to a compact editable string (optional blur helper). */
export function compactAmountInputDisplay(raw: string): string {
  return raw.replace(GROUPING_SPACE_RE, "").trim()
}

export { decimalSeparatorForLocale, groupingSeparatorForLocale }
