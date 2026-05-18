import type { FiatCurrencyCode } from "@/lib/currency-display"
import type { AppLanguage, UserPreferences } from "@/lib/user-preferences"
import {
  OPERATING_COUNTRIES,
  OPERATING_COUNTRY_OPTIONS,
  operatingCountryByCode,
} from "@/lib/operating-countries"

export { OPERATING_COUNTRY_OPTIONS, operatingCountriesByRegion } from "@/lib/operating-countries"

/**
 * Suggested display language + fiat when the user picks an operating country.
 * Not authoritative for accounting — UX hints only (user can override in settings).
 */
export function suggestPreferencesForCountry(iso2: string): Partial<UserPreferences> {
  const row = operatingCountryByCode(iso2)
  if (!row) return {}
  return { language: row.language, currency: row.currency }
}

/** @deprecated Use OPERATING_COUNTRIES from lib/operating-countries — kept for imports. */
export const REGION_DEFAULTS = Object.fromEntries(
  OPERATING_COUNTRIES.map((c) => [c.code, { language: c.language, currency: c.currency }]),
) as Partial<Record<string, { language: AppLanguage; currency: FiatCurrencyCode }>>
