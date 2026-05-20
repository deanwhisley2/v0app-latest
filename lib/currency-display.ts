/**
 * Display helpers for wallet / funding UI.
 *
 * Server-side accounting uses USD-equivalent units; customer screens should show
 * local fiat amounts only — never conversion mechanics or treasury wording.
 */
import { localUnitsToUsd } from "@/lib/nexus-fx"
import { NEXUS_MIN_DEPOSIT_USD } from "@/lib/nexus-financial-policy"

/** Approximate USD → local rates for display (container / wallet copy). Not FX trading quotes. */
export const USD_TO_FX: Record<string, number> = {
  USD: 1,
  UGX: 3750,
  KES: 130,
  TZS: 2520,
  RWF: 1350,
  NGN: 1550,
  GHS: 15.5,
  ZAR: 18.2,
  XOF: 605,
  XAF: 605,
  MAD: 10.1,
  EGP: 48,
  ETB: 57,
  ZMW: 27,
  MWK: 1730,
  MZN: 64,
  BWP: 13.6,
  CDF: 2850,
}

export type FiatCurrencyCode = keyof typeof USD_TO_FX

/** ISO 3166-1 alpha-2 → typical mobile-money / wallet fiat for corridor pricing (Add Funds Local MM). */
const ISO2_TO_CORRIDOR_FIAT: Partial<Record<string, FiatCurrencyCode>> = {
  UG: "UGX",
  KE: "KES",
  TZ: "TZS",
  RW: "RWF",
  NG: "NGN",
  GH: "GHS",
  ZA: "ZAR",
  MW: "MWK",
  ET: "ETB",
  ZM: "ZMW",
  MZ: "MZN",
  BW: "BWP",
  ZW: "USD",
  CD: "CDF",
  MA: "MAD",
  EG: "EGP",
  US: "USD",
}

/** Resolve fiat for amount conversion when user picked a funding country on Local MM (overrides display prefs). */
export function corridorFiatForCountryIso2(iso2: string): FiatCurrencyCode | null {
  const cc = iso2.trim().toUpperCase().slice(0, 2)
  return ISO2_TO_CORRIDOR_FIAT[cc] ?? null
}

export function isSupportedFiat(code: string): code is FiatCurrencyCode {
  return code in USD_TO_FX
}

export function convertFromUsd(amountUsd: number, currency: string): number {
  const rate = USD_TO_FX[currency as FiatCurrencyCode] ?? USD_TO_FX.USD
  return amountUsd * rate
}

/** Spaces used as thousand separators (incl. narrow no-break space from Intl fr-CD). */
const GROUPING_SPACE_RE = /[\s\u00a0\u202f]/g

/**
 * Parse customer-typed fiat in the amount field.
 * Supports US/UK (`1,519,990.50`), French/Congo (`1 519 199,50`), and plain digits.
 */
export function parseCustomerLocalAmountInput(raw: string): number {
  let s = raw.trim()
  if (!s) return NaN

  s = s.replace(/[a-zA-Z]{2,6}/g, "").trim()
  if (!s) return NaN

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
  } else {
    s = s.replace(GROUPING_SPACE_RE, "")
  }

  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

/** User-typed amount in their fiat → USD accounting unit (env FX map, then static corridor table). */
export function localFiatUnitsToUsd(amountLocal: number, currency: string): number {
  if (!Number.isFinite(amountLocal) || amountLocal <= 0) return 0
  const c = isSupportedFiat(currency) ? currency : "USD"
  if (c === "USD") return Math.round(amountLocal * 100) / 100
  const fromEnv = localUnitsToUsd(amountLocal, c)
  if (fromEnv != null && fromEnv > 0) return fromEnv
  const rate = USD_TO_FX[c as FiatCurrencyCode] ?? 1
  return Math.round((amountLocal / rate) * 1e6) / 1e6
}

/** Parse local input string and convert to ledger USD for mutations. */
export function usdFromCustomerLocalInput(raw: string, currency: string): number {
  return localFiatUnitsToUsd(parseCustomerLocalAmountInput(raw), currency)
}

/** Format a number already in local fiat (e.g. echoing raw input). Does NOT treat value as USD. */
export function formatLocalFiatAmount(amountLocal: number, currency: string, locale: string): string {
  const c = isSupportedFiat(currency) ? currency : "USD"
  try {
    return new Intl.NumberFormat(locale || "en", {
      style: "currency",
      currency: c,
      maximumFractionDigits: c === "UGX" || c === "TZS" || c === "RWF" || c === "MWK" ? 0 : 2,
    }).format(amountLocal)
  } catch {
    return `${c} ${amountLocal.toFixed(0)}`
  }
}

/** Format ledger/API USD for the user’s display currency (same as UserPreferences formatUserMoney). */
export function formatAccountingUsdForDisplay(amountUsd: number, currency: string, locale: string): string {
  return formatMoneyAmount(amountUsd, currency, locale)
}

/** Product minimum deposit expressed in the user's fiat (display only). */
export function minDepositLocalAmount(currency: string): number {
  const c = isSupportedFiat(currency) ? currency : "USD"
  const local = convertFromUsd(NEXUS_MIN_DEPOSIT_USD, c)
  if (c === "UGX" || c === "TZS" || c === "RWF" || c === "MWK") return Math.ceil(local)
  return Math.round(local * 100) / 100
}

export function formatMinDepositForCustomer(currency: string, locale: string): string {
  const c = isSupportedFiat(currency) ? currency : "USD"
  return formatLocalFiatAmount(minDepositLocalAmount(c), c, locale)
}

export function formatMoneyAmount(amountUsd: number, currency: string, locale: string): string {
  const c = isSupportedFiat(currency) ? currency : "USD"
  const local = convertFromUsd(amountUsd, c)
  try {
    return new Intl.NumberFormat(locale || "en", {
      style: "currency",
      currency: c,
      maximumFractionDigits: c === "UGX" || c === "TZS" || c === "RWF" || c === "MWK" ? 0 : 2,
    }).format(local)
  } catch {
    return `${c} ${local.toFixed(0)}`
  }
}
