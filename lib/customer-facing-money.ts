/**
 * Customer-facing money: parse localized input, format USD ledger as corridor fiat.
 * Admin/ledger code uses USD; customer UI never shows conversion mechanics.
 */
import {
  formatLocalFiatAmount,
  formatMoneyAmount,
  isSupportedFiat,
  localFiatUnitsToUsd,
  type FiatCurrencyCode,
} from "@/lib/currency-display"
import { parseCustomerLocalAmountInput } from "@/lib/customer-amount-parse"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import { localeForCustomerCorridor } from "@/lib/customer-corridor-money"
import type { AppLanguage } from "@/lib/user-preferences"

export { parseCustomerLocalAmountInput } from "@/lib/customer-amount-parse"

export type CustomerMoneyContext = {
  fundingCountryCode?: string | null
  currency: string
  locale: string
  language?: AppLanguage
}

export function buildCustomerMoneyContext(params: {
  fundingCountryCode?: string | null
  preferredCurrency?: string | null
  language?: AppLanguage
}): CustomerMoneyContext {
  const language = params.language ?? "en"
  const currency = displayCurrencyForCustomer(
    params.fundingCountryCode ?? null,
    params.preferredCurrency ?? null,
  )
  const locale = localeForCustomerCorridor(params.fundingCountryCode ?? null, language)
  return {
    fundingCountryCode: params.fundingCountryCode ?? null,
    currency,
    locale,
    language,
  }
}

/** Ledger USD → customer corridor display string (never raw USD for non-US corridors). */
export function formatUsdForCustomerDisplay(amountUsd: number, ctx: CustomerMoneyContext): string {
  const c = isSupportedFiat(ctx.currency) ? ctx.currency : "USD"
  return formatMoneyAmount(amountUsd, c, ctx.locale)
}

/** Local units already (not USD) → formatted display. */
export function formatLocalForCustomerDisplay(amountLocal: number, ctx: CustomerMoneyContext): string {
  const c = isSupportedFiat(ctx.currency) ? ctx.currency : "USD"
  return formatLocalFiatAmount(amountLocal, c, ctx.locale)
}

/** Parse user input string → local fiat number. */
export function parseCustomerAmountInput(raw: string): number {
  return parseCustomerLocalAmountInput(raw)
}

/** Parse input → USD ledger unit for mutations. */
export function usdFromCustomerInput(raw: string, ctx: CustomerMoneyContext): number {
  return localFiatUnitsToUsd(parseCustomerLocalAmountInput(raw), ctx.currency)
}

/** Integer minor units corridors (no decimal display). */
export const ZERO_DECIMAL_FIATS: ReadonlySet<FiatCurrencyCode> = new Set([
  "UGX",
  "TZS",
  "RWF",
  "MWK",
  "CDF",
])

export function fiatDecimalPlaces(currency: string): number {
  const c = currency.toUpperCase()
  if (ZERO_DECIMAL_FIATS.has(c as FiatCurrencyCode)) return 0
  return 2
}
