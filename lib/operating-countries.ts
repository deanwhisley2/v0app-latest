import type { FiatCurrencyCode } from "@/lib/currency-display"
import type { AppLanguage } from "@/lib/user-preferences"

export type OperatingCountryDef = {
  /** ISO 3166-1 alpha-2 */
  code: string
  label: string
  region: string
  currency: FiatCurrencyCode
  language: AppLanguage
}

/** Canonical operating countries — funding corridors, signup, and IP enforcement. */
export const OPERATING_COUNTRIES: readonly OperatingCountryDef[] = [
  { code: "MZ", label: "Mozambique", region: "Southern Africa", currency: "MZN", language: "pt" },
  { code: "ZM", label: "Zambia", region: "Southern Africa", currency: "ZMW", language: "en" },
  { code: "ZW", label: "Zimbabwe", region: "Southern Africa", currency: "USD", language: "en" },
  { code: "BW", label: "Botswana", region: "Southern Africa", currency: "BWP", language: "en" },
  { code: "MW", label: "Malawi", region: "East/Southern Africa", currency: "MWK", language: "en" },
  { code: "KE", label: "Kenya", region: "East Africa", currency: "KES", language: "en" },
  { code: "CD", label: "Congo (DRC)", region: "Central Africa", currency: "CDF", language: "fr" },
  {
    code: "CG",
    label: "Congo (Brazzaville)",
    region: "Central Africa",
    currency: "XAF",
    language: "fr",
  },
  { code: "UG", label: "Uganda", region: "East Africa", currency: "UGX", language: "en" },
  { code: "TZ", label: "Tanzania", region: "East Africa", currency: "TZS", language: "sw" },
  { code: "RW", label: "Rwanda", region: "East Africa", currency: "RWF", language: "en" },
  { code: "SD", label: "Sudan", region: "North/East Africa", currency: "USD", language: "ar" },
  { code: "NG", label: "Nigeria", region: "West Africa", currency: "NGN", language: "en" },
  { code: "GH", label: "Ghana", region: "West Africa", currency: "GHS", language: "en" },
  { code: "ZA", label: "South Africa", region: "Southern Africa", currency: "ZAR", language: "en" },
  { code: "ET", label: "Ethiopia", region: "East Africa", currency: "ETB", language: "am" },
  { code: "SN", label: "Senegal", region: "West Africa", currency: "XOF", language: "fr" },
  { code: "CI", label: "Côte d’Ivoire", region: "West Africa", currency: "XOF", language: "fr" },
  { code: "BF", label: "Burkina Faso", region: "West Africa", currency: "XOF", language: "fr" },
  { code: "CM", label: "Cameroon", region: "Central Africa", currency: "XAF", language: "fr" },
  { code: "EG", label: "Egypt", region: "North Africa", currency: "EGP", language: "ar" },
  { code: "MA", label: "Morocco", region: "North Africa", currency: "MAD", language: "fr" },
] as const

const BY_CODE = new Map(OPERATING_COUNTRIES.map((c) => [c.code, c]))

export function isSupportedOperatingCountry(code: string | null | undefined): boolean {
  const cc = code?.trim().toUpperCase().slice(0, 2) ?? ""
  return cc.length === 2 && BY_CODE.has(cc)
}

export function operatingCountryByCode(code: string | null | undefined): OperatingCountryDef | null {
  const cc = code?.trim().toUpperCase().slice(0, 2) ?? ""
  return BY_CODE.get(cc) ?? null
}

export function corridorCurrencyForCountry(code: string | null | undefined): FiatCurrencyCode | null {
  return operatingCountryByCode(code)?.currency ?? null
}

/** Legacy flat list for selects. */
export const OPERATING_COUNTRY_OPTIONS: { code: string; label: string; region: string }[] =
  OPERATING_COUNTRIES.map((c) => ({ code: c.code, label: c.label, region: c.region }))

export function operatingCountriesByRegion(): { region: string; countries: OperatingCountryDef[] }[] {
  const order = [
    "Southern Africa",
    "East/Southern Africa",
    "East Africa",
    "Central Africa",
    "West Africa",
    "North/East Africa",
    "North Africa",
  ]
  const groups = new Map<string, OperatingCountryDef[]>()
  for (const c of OPERATING_COUNTRIES) {
    const list = groups.get(c.region) ?? []
    list.push(c)
    groups.set(c.region, list)
  }
  const out: { region: string; countries: OperatingCountryDef[] }[] = []
  for (const region of order) {
    const countries = groups.get(region)
    if (countries?.length) out.push({ region, countries })
  }
  for (const [region, countries] of groups) {
    if (!order.includes(region)) out.push({ region, countries })
  }
  return out
}
