import { corridorCurrencyForCountry, operatingCountryByCode } from "@/lib/operating-countries"
import { isSupportedFiat, type FiatCurrencyCode } from "@/lib/currency-display"
import type { AppLanguage, UserPreferences } from "@/lib/user-preferences"
import { LANGUAGE_OPTIONS, readLanguageUserSet } from "@/lib/user-preferences"

/**
 * Customer-visible wallet/trade amounts use the operating-country fiat when set.
 * Ledger remains USD-normalized; this only resolves what the user sees.
 */
export function displayCurrencyForCustomer(
  fundingCountryCode: string | null | undefined,
  preferredCurrency: string | null | undefined,
): FiatCurrencyCode {
  const corridor = corridorCurrencyForCountry(fundingCountryCode)
  if (corridor) return corridor
  const cur = preferredCurrency?.trim().toUpperCase() ?? ""
  if (cur && isSupportedFiat(cur)) return cur
  return "USD"
}

/** When a corridor country is set, display currency must match — never show USD for UG, KE, etc. */
export function corridorOverridesPreferredCurrency(
  fundingCountryCode: string | null | undefined,
  preferredCurrency: string | null | undefined,
): boolean {
  const corridor = corridorCurrencyForCountry(fundingCountryCode)
  if (!corridor) return false
  const pref = preferredCurrency?.trim().toUpperCase() ?? "USD"
  return pref !== corridor
}

export function mergeCustomerPreferencesWithCorridor(
  prefs: UserPreferences,
  /** Profile / server corridor — wins over stale client storage when set. */
  fundingCountryCode: string | null | undefined,
): UserPreferences {
  const profileCc = fundingCountryCode?.trim().toUpperCase().slice(0, 2) ?? ""
  const prefCc = prefs.country?.trim().toUpperCase().slice(0, 2) ?? ""
  const country =
    (profileCc.length === 2 && operatingCountryByCode(profileCc) ? profileCc : "") ||
    (prefCc.length === 2 ? prefCc : "") ||
    undefined
  const countryOk = country && operatingCountryByCode(country) ? country : prefs.country
  const currency = displayCurrencyForCustomer(countryOk ?? null, prefs.currency)
  const row = operatingCountryByCode(countryOk ?? null)
  let language = prefs.language
  if (countryOk === "KE") {
    language = "en"
  } else if (row && row.language !== language && !readLanguageUserSet()) {
    language = row.language
  }
  return {
    ...prefs,
    ...(countryOk ? { country: countryOk } : {}),
    currency,
    language,
  }
}

/** Currency options shown in settings — locked to corridor when country is set. */
export function customerCurrencyOptionsForCountry(
  fundingCountryCode: string | null | undefined,
): FiatCurrencyCode[] | null {
  const corridor = corridorCurrencyForCountry(fundingCountryCode)
  if (!corridor) return null
  return [corridor]
}

/** Kenya corridor: English-only UI in profile and settings. */
export function customerLanguageOptionsForCountry(
  fundingCountryCode: string | null | undefined,
): AppLanguage[] | null {
  const cc = fundingCountryCode?.trim().toUpperCase().slice(0, 2) ?? ""
  if (cc === "KE") return ["en"]
  return null
}

export function customerLanguageChoicesForCountry(
  fundingCountryCode: string | null | undefined,
): typeof LANGUAGE_OPTIONS {
  const locked = customerLanguageOptionsForCountry(fundingCountryCode)
  if (locked?.length) {
    return LANGUAGE_OPTIONS.filter((o) => locked.includes(o.code))
  }
  return LANGUAGE_OPTIONS
}
