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
 * Currency for staking copy/fixed trades — operating-country corridor fiat when the corridor
 * has local money (UG→UGX, KE→KES, …). USD preference only applies for USD corridors or
 * users without a locked operating country. Ledger remains USD.
 */
export function accountBalanceCurrencyForStaking(
  fundingCountryCode: string | null | undefined,
  preferredCurrency?: string | null,
): FiatCurrencyCode {
  if (corridorOverridesPreferredCurrency(fundingCountryCode, preferredCurrency)) {
    return corridorDisplayFiatForFunding(fundingCountryCode)
  }
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

/** Operating corridors with local fiat always display in corridor currency — not USD. */
export function corridorOverridesPreferredCurrency(
  fundingCountryCode: string | null | undefined,
  preferredCurrency?: string | null,
): boolean {
  const corridor = corridorCurrencyForCountry(fundingCountryCode)
  if (!corridor || corridor === "USD") return false
  const pref = (preferredCurrency ?? "").trim().toUpperCase()
  return !pref || pref !== corridor
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
  return corridor === "USD" ? ["USD"] : [corridor]
}

export function customerLanguageChoicesForCountry(
  _fundingCountryCode: string | null | undefined,
): typeof LANGUAGE_OPTIONS {
  return LANGUAGE_OPTIONS
}
