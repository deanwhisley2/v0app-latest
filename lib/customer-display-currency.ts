import { corridorCurrencyForCountry, operatingCountryByCode } from "@/lib/operating-countries"
import type { FiatCurrencyCode } from "@/lib/currency-display"
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

/** Wallet/trade surfaces use USD only. */
export function displayCurrencyForCustomer(
  _fundingCountryCode: string | null | undefined,
  _preferredCurrency?: string | null,
): FiatCurrencyCode {
  return "USD"
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
    currency: "USD",
    language,
  }
}

/** Platform display currency is always USD. */
export function customerCurrencyOptionsForCountry(
  _fundingCountryCode: string | null | undefined,
): FiatCurrencyCode[] | null {
  return ["USD"]
}

export function customerLanguageChoicesForCountry(
  _fundingCountryCode: string | null | undefined,
): typeof LANGUAGE_OPTIONS {
  return LANGUAGE_OPTIONS
}
