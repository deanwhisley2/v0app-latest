import { corridorCurrencyForCountry, operatingCountryByCode } from "@/lib/operating-countries"
import { isSupportedFiat, type FiatCurrencyCode } from "@/lib/currency-display"
import type { UserPreferences } from "@/lib/user-preferences"
import { LANGUAGE_OPTIONS, normalizeAppLanguage, readLanguageUserSet } from "@/lib/user-preferences"

/**
 * Corridor fiat for Add Funds / Withdraw local amount entry only — not wallet display.
 */
export function corridorDisplayFiatForFunding(
  fundingCountryCode: string | null | undefined,
): FiatCurrencyCode {
  const corridor = corridorCurrencyForCountry(fundingCountryCode)
  return corridor ?? "USD"
}

/**
 * Currency for staking copy/fixed trades — user preferred balance currency when supported,
 * otherwise operating-country corridor fiat, else USD. Ledger remains USD.
 */
export function accountBalanceCurrencyForStaking(
  fundingCountryCode: string | null | undefined,
  preferredCurrency?: string | null,
): FiatCurrencyCode {
  const pref = (preferredCurrency ?? "").trim().toUpperCase()
  if (pref && isSupportedFiat(pref)) return pref as FiatCurrencyCode
  return corridorDisplayFiatForFunding(fundingCountryCode)
}

/** Customer wallet, trade panels, and history display — corridor fiat from country + preference. */
export function displayCurrencyForCustomer(
  fundingCountryCode: string | null | undefined,
  preferredCurrency?: string | null,
): FiatCurrencyCode {
  return accountBalanceCurrencyForStaking(fundingCountryCode, preferredCurrency)
}

export function corridorOverridesPreferredCurrency(
  _fundingCountryCode: string | null | undefined,
  _preferredCurrency?: string | null,
): boolean {
  return false
}

export function mergeCustomerPreferencesWithCorridor(
  prefs: UserPreferences,
  fundingCountryCode: string | null | undefined,
): UserPreferences {
  const profileCc = fundingCountryCode?.trim().toUpperCase().slice(0, 2) ?? ""
  const prefCc = prefs.country?.trim().toUpperCase().slice(0, 2) ?? ""
  const country =
    (profileCc.length === 2 && operatingCountryByCode(profileCc) ? profileCc : "") ||
    (prefCc.length === 2 ? prefCc : "") ||
    undefined
  const countryOk = country && operatingCountryByCode(country) ? country : prefs.country
  const row = operatingCountryByCode(countryOk ?? null)

  let language = normalizeAppLanguage(prefs.language)
  if (row && row.language === "fr" && !readLanguageUserSet()) {
    language = "fr"
  } else if (row && !readLanguageUserSet()) {
    language = "en"
  }

  return {
    ...prefs,
    ...(countryOk ? { country: countryOk } : {}),
    currency: accountBalanceCurrencyForStaking(countryOk ?? null, prefs.currency),
    language,
  }
}

/** Account balance / stake currency options (corridor + USD). */
export function customerCurrencyOptionsForCountry(
  fundingCountryCode: string | null | undefined,
): FiatCurrencyCode[] | null {
  const corridor = corridorCurrencyForCountry(fundingCountryCode)
  if (!corridor) return ["USD"]
  return corridor === "USD" ? ["USD"] : [corridor, "USD"]
}

export function customerLanguageChoicesForCountry(
  _fundingCountryCode: string | null | undefined,
): typeof LANGUAGE_OPTIONS {
  return LANGUAGE_OPTIONS
}
