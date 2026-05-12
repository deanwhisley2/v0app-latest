import type { FiatCurrencyCode } from "@/lib/currency-display"
import type { AppLanguage, UserPreferences } from "@/lib/user-preferences"

/**
 * Suggested display language + fiat when the user picks an operating country.
 * Not authoritative for accounting — UX hints only (user can override in settings).
 */
const REGION_DEFAULTS: Partial<Record<string, { language: AppLanguage; currency: FiatCurrencyCode }>> = {
  UG: { language: "en", currency: "UGX" },
  KE: { language: "sw", currency: "KES" },
  TZ: { language: "sw", currency: "TZS" },
  RW: { language: "en", currency: "RWF" },
  CD: { language: "fr", currency: "USD" },
  SD: { language: "ar", currency: "USD" },
  ZM: { language: "en", currency: "ZMW" },
  NG: { language: "en", currency: "NGN" },
  GH: { language: "en", currency: "GHS" },
  ZA: { language: "en", currency: "ZAR" },
  EG: { language: "ar", currency: "EGP" },
  MA: { language: "fr", currency: "MAD" },
  ET: { language: "en", currency: "ETB" },
  MW: { language: "en", currency: "MWK" },
  SN: { language: "fr", currency: "XOF" },
  CI: { language: "fr", currency: "XOF" },
  CM: { language: "fr", currency: "XAF" },
}

export function suggestPreferencesForCountry(iso2: string): Partial<UserPreferences> {
  const code = iso2.trim().toUpperCase()
  if (code.length !== 2) return {}
  const row = REGION_DEFAULTS[code]
  if (!row) return {}
  return { language: row.language, currency: row.currency }
}

export const OPERATING_COUNTRY_OPTIONS: { code: string; label: string }[] = [
  { code: "UG", label: "Uganda" },
  { code: "KE", label: "Kenya" },
  { code: "TZ", label: "Tanzania" },
  { code: "RW", label: "Rwanda" },
  { code: "CD", label: "DR Congo" },
  { code: "SD", label: "Sudan" },
  { code: "ZM", label: "Zambia" },
  { code: "NG", label: "Nigeria" },
  { code: "GH", label: "Ghana" },
  { code: "ZA", label: "South Africa" },
  { code: "EG", label: "Egypt" },
  { code: "MA", label: "Morocco" },
  { code: "ET", label: "Ethiopia" },
  { code: "MW", label: "Malawi" },
  { code: "SN", label: "Senegal" },
  { code: "CI", label: "Côte d’Ivoire" },
  { code: "CM", label: "Cameroon" },
]
