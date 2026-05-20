import { formatLocalFiatAmount, formatMoneyAmount, isSupportedFiat } from "@/lib/currency-display"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import {
  corridorCurrencyForCountry,
  isSupportedOperatingCountry,
  operatingCountryByCode,
} from "@/lib/operating-countries"
import { NEXUS_CD_MIN_MAIN_RETAIN_USD } from "@/lib/nexus-financial-policy"

export const CONGO_COUNTRY_ISO2 = "CD"

/** Foreign tickers that must not appear on Congo customer notifications when corridor is CDF. */
const FOREIGN_FIAT_TICKER_RE = /\b(UGX|KES|TZS|RWF|NGN|GHS|MZN|ZMW|MWK|BWP|ETB|XOF|XAF|MAD|EGP)\b/gi

const FOREIGN_AMOUNT_CHUNK_RE =
  /\b(?:UGX|KES|TZS|RWF|NGN|GHS|MZN|ZMW|MWK|BWP|ETB|XOF|XAF|MAD|EGP)\s+[\d][\d,.\s]*/gi

export function isCongoOperatingCountry(code: string | null | undefined): boolean {
  return code?.trim().toUpperCase().slice(0, 2) === CONGO_COUNTRY_ISO2
}

export function nexusMainMinimumRetainUsd(fundingCountryCode: string | null | undefined): number {
  return isCongoOperatingCountry(fundingCountryCode) ? NEXUS_CD_MIN_MAIN_RETAIN_USD : 0
}

export function fundingInputCurrencyMatchesCorridor(
  fundingCountryCode: string | null | undefined,
  inputCurrency: string | null | undefined,
): boolean {
  const corridor = corridorCurrencyForCountry(fundingCountryCode)
  if (!corridor) return true
  const input = inputCurrency?.trim().toUpperCase() ?? ""
  if (!input) return true
  return input === corridor
}

export function formatFundingApprovedAmountForCustomer(params: {
  amountUsd?: number | null
  amountInputLocal?: number | null
  inputCurrency?: string | null
  fundingCountryCode?: string | null
  preferredCurrency?: string | null
  locale?: string
}): string | null {
  const locale = params.locale ?? "en-US"
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
  if (
    inputCcy.length >= 3 &&
    Number.isFinite(local) &&
    local > 0 &&
    fundingInputCurrencyMatchesCorridor(params.fundingCountryCode, inputCcy) &&
    isSupportedFiat(inputCcy)
  ) {
    return formatLocalFiatAmount(local, inputCcy, locale)
  }
  return null
}

export type NotificationViewerCorridor = {
  fundingCountryCode?: string | null
  displayCurrency?: string
  locale?: string
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
  const locale = viewer.locale ?? "en-US"
  const usd = Number(amountUsd ?? NaN)

  if (!Number.isFinite(usd) || !(usd > 0)) {
    if (display === corridor && FOREIGN_FIAT_TICKER_RE.test(text)) {
      return text.replace(FOREIGN_FIAT_TICKER_RE, display)
    }
    return text
  }

  const formatted = formatMoneyAmount(usd, display, locale)
  if (!FOREIGN_AMOUNT_CHUNK_RE.test(text)) return text

  return text.replace(FOREIGN_AMOUNT_CHUNK_RE, formatted)
}
