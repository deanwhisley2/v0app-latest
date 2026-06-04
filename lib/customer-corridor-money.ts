import { formatLocalFiatAmount, formatMoneyAmount, isSupportedFiat, type FiatCurrencyCode } from "@/lib/currency-display"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import {
  corridorCurrencyForCountry,
  isSupportedOperatingCountry,
  operatingCountryByCode,
} from "@/lib/operating-countries"
import { NEXUS_CD_MIN_MAIN_RETAIN_USD } from "@/lib/nexus-financial-policy"
import { localeForLanguage, type AppLanguage } from "@/lib/user-preferences"

/** Democratic Republic of the Congo — CDF corridor. */
export const CONGO_DRC_COUNTRY_ISO2 = "CD"

/** @deprecated Use CONGO_DRC_COUNTRY_ISO2 */
export const CONGO_COUNTRY_ISO2 = CONGO_DRC_COUNTRY_ISO2

/** Republic of the Congo (Brazzaville) — Central African CFA (XAF). */
export const CONGO_BRAZZAVILLE_COUNTRY_ISO2 = "CG"

/** French-style amount grouping (space thousands, comma decimals) by operating country. */
const FRENCH_AMOUNT_LOCALE_BY_COUNTRY: Partial<Record<string, string>> = {
  CD: "fr-CD",
  CG: "fr-CG",
  CM: "fr-CM",
  SN: "fr-SN",
  CI: "fr-CI",
  BF: "fr-BF",
  MA: "fr-MA",
}

const ALL_FOREIGN_FIAT_TICKERS = [
  "UGX",
  "CDF",
  "KES",
  "TZS",
  "RWF",
  "NGN",
  "GHS",
  "MZN",
  "ZMW",
  "MWK",
  "BWP",
  "ETB",
  "XOF",
  "XAF",
  "MAD",
  "EGP",
  "USD",
  "USDT",
] as const

function foreignFiatTickerPattern(excludeCurrency: string | null | undefined): RegExp {
  const exclude = excludeCurrency?.trim().toUpperCase() ?? ""
  const tokens = ALL_FOREIGN_FIAT_TICKERS.filter((c) => c !== exclude)
  return new RegExp(`\\b(?:${tokens.join("|")}|CFA|FC)\\b`, "gi")
}

function foreignAmountChunkPattern(excludeCurrency: string | null | undefined): RegExp {
  const exclude = excludeCurrency?.trim().toUpperCase() ?? ""
  const tokens = ALL_FOREIGN_FIAT_TICKERS.filter((c) => c !== exclude)
  return new RegExp(
    `\\b(?:${tokens.join("|")}|CFA|FC)\\s+[\\d][\\d,.\s\u00a0\u202f]*/gi`,
  )
}

/** Intl locale for amount formatting (fr-CD / fr-CG for French; en-US for English UI). */
export function localeForCustomerCorridor(
  fundingCountryCode: string | null | undefined,
  language: AppLanguage,
): string {
  const cc = fundingCountryCode?.trim().toUpperCase().slice(0, 2) ?? ""
  if (language === "fr" && FRENCH_AMOUNT_LOCALE_BY_COUNTRY[cc]) {
    return FRENCH_AMOUNT_LOCALE_BY_COUNTRY[cc]!
  }
  return localeForLanguage(language)
}

export function isDrcOperatingCountry(code: string | null | undefined): boolean {
  return code?.trim().toUpperCase().slice(0, 2) === CONGO_DRC_COUNTRY_ISO2
}

/** @deprecated Use isDrcOperatingCountry */
export function isCongoOperatingCountry(code: string | null | undefined): boolean {
  return isDrcOperatingCountry(code)
}

export function isCongoBrazzavilleOperatingCountry(code: string | null | undefined): boolean {
  return code?.trim().toUpperCase().slice(0, 2) === CONGO_BRAZZAVILLE_COUNTRY_ISO2
}

/** CD (DRC) or CG (Brazzaville) — shared French formatting / parsing UX. */
export function isCentralAfricaLocalizedCorridor(code: string | null | undefined): boolean {
  const cc = code?.trim().toUpperCase().slice(0, 2) ?? ""
  return cc === CONGO_DRC_COUNTRY_ISO2 || cc === CONGO_BRAZZAVILLE_COUNTRY_ISO2
}

/** @deprecated Prefer `mainMinimumRetainUsd` from `lib/server/withdrawal-policy` with full profile row. */
export function nexusMainMinimumRetainUsd(fundingCountryCode: string | null | undefined): number {
  return isDrcOperatingCountry(fundingCountryCode) ? NEXUS_CD_MIN_MAIN_RETAIN_USD : 0
}

export function fundingInputCurrencyMatchesCorridor(
  fundingCountryCode: string | null | undefined,
  inputCurrency: string | null | undefined,
): boolean {
  const corridor = corridorCurrencyForCountry(fundingCountryCode)
  if (!corridor) return true
  const input = inputCurrency?.trim().toUpperCase() ?? ""
  if (!input) return true
  if (input === "CFA" && corridor === "XAF") return true
  if (input === "FC" && corridor === "CDF") return true
  return input === corridor
}

export function formatFundingApprovedAmountForCustomer(params: {
  amountUsd?: number | null
  amountInputLocal?: number | null
  inputCurrency?: string | null
  fundingCountryCode?: string | null
  preferredCurrency?: string | null
  locale?: string
  language?: AppLanguage
}): string | null {
  const locale =
    params.locale ??
    localeForCustomerCorridor(params.fundingCountryCode ?? null, params.language ?? "en")
  const displayCcy = displayCurrencyForCustomer(
    params.fundingCountryCode ?? null,
    params.preferredCurrency ?? null,
  )
  const usd = Number(params.amountUsd ?? NaN)
  if (Number.isFinite(usd) && usd > 0) {
    return formatMoneyAmount(usd, displayCcy, locale)
  }
  const local = Number(params.amountInputLocal ?? NaN)
  const inputCcy = String(params.inputCurrency ?? "").trim().toUpperCase()
  const normalizedInput =
    inputCcy === "CFA" && displayCcy === "XAF"
      ? "XAF"
      : inputCcy === "FC" && displayCcy === "CDF"
        ? "CDF"
        : inputCcy
  if (
    normalizedInput.length >= 3 &&
    Number.isFinite(local) &&
    local > 0 &&
    fundingInputCurrencyMatchesCorridor(params.fundingCountryCode, normalizedInput) &&
    isSupportedFiat(normalizedInput as FiatCurrencyCode)
  ) {
    return formatLocalFiatAmount(local, normalizedInput, locale)
  }
  return null
}

export type NotificationViewerCorridor = {
  fundingCountryCode?: string | null
  displayCurrency?: string
  locale?: string
  language?: AppLanguage
}

/** Replace wrong-corridor fiat tickers in stored notification copy (e.g. UGX on a Congo account). */
export function rewriteNotificationAmountsForCorridor(
  text: string,
  viewer: NotificationViewerCorridor,
  amountUsd?: number | null,
): string {
  const country = viewer.fundingCountryCode?.trim().toUpperCase().slice(0, 2) ?? ""
  if (!isSupportedOperatingCountry(country)) return text
  const corridor = operatingCountryByCode(country)?.currency
  if (!corridor) return text

  const display =
    viewer.displayCurrency && isSupportedFiat(viewer.displayCurrency)
      ? viewer.displayCurrency
      : corridor
  const locale =
    viewer.locale ?? localeForCustomerCorridor(country, viewer.language ?? "en")
  const usd = Number(amountUsd ?? NaN)
  const foreignTicker = foreignFiatTickerPattern(display)
  const foreignChunk = foreignAmountChunkPattern(display)

  if (!Number.isFinite(usd) || !(usd > 0)) {
    if (display === corridor && foreignTicker.test(text)) {
      return text.replace(foreignTicker, display)
    }
    return text
  }

  const formatted = formatMoneyAmount(usd, display, locale)
  const usdDollarChunk = /\$\s*[\d][\d,.\s\u00a0\u202f]*/g
  let out = text
  if (foreignChunk.test(out)) out = out.replace(foreignChunk, formatted)
  if (usdDollarChunk.test(out)) out = out.replace(usdDollarChunk, formatted)
  return out
}
