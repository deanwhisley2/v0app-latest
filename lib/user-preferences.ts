import type { FiatCurrencyCode } from "@/lib/currency-display"

export const PREFERENCE_STORAGE_KEY = "nexus_user_preferences"
/** Set when the user explicitly picks a language in Settings (do not auto-overwrite). */
export const LANGUAGE_USER_SET_KEY = "nexus_language_user_set"

/** Customer-selectable UI languages (Settings → Language). */
export type AppLanguage = "en" | "fr"

export interface UserPreferences {
  language: AppLanguage
  /** Display preference — platform balances always show USD; local fiat only on funding/withdraw flows. */
  currency: FiatCurrencyCode | string
  /** ISO 3166-1 alpha-2 operating country (funding corridors, regional UX). Optional. */
  country?: string
}

export const LANGUAGE_OPTIONS: { code: AppLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
]

/** Map legacy stored/auth metadata languages to the supported pair. */
export function normalizeAppLanguage(raw: string | null | undefined): AppLanguage {
  const code = (raw ?? "").trim().toLowerCase()
  return code === "fr" ? "fr" : "en"
}

export const CURRENCY_OPTIONS: { code: FiatCurrencyCode; label: string }[] = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "UGX", label: "UGX — Uganda Shilling" },
  { code: "KES", label: "KES — Kenyan Shilling" },
  { code: "TZS", label: "TZS — Tanzanian Shilling" },
  { code: "RWF", label: "RWF — Rwandan Franc" },
  { code: "NGN", label: "NGN — Nigerian Naira" },
  { code: "GHS", label: "GHS — Ghanaian Cedi" },
  { code: "ZAR", label: "ZAR — South African Rand" },
  { code: "XOF", label: "XOF — CFA Franc BCEAO" },
  { code: "XAF", label: "XAF — CFA Franc BEAC" },
  { code: "MAD", label: "MAD — Moroccan Dirham" },
  { code: "EGP", label: "EGP — Egyptian Pound" },
  { code: "ETB", label: "ETB — Ethiopian Birr" },
  { code: "ZMW", label: "ZMW — Zambian Kwacha" },
  { code: "MWK", label: "MWK — Malawian Kwacha" },
  { code: "MZN", label: "MZN — Mozambican Metical" },
  { code: "BWP", label: "BWP — Botswana Pula" },
  { code: "CDF", label: "CDF — Congolese Franc" },
]

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: "en",
  currency: "USD",
  country: undefined,
}

export function parsePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES }
  const o = raw as Record<string, unknown>
  const language =
    typeof o.language === "string"
      ? normalizeAppLanguage(o.language)
      : DEFAULT_PREFERENCES.language
  const countryRaw = typeof o.country === "string" ? o.country.trim().toUpperCase() : ""
  const country = countryRaw.length === 2 && /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : undefined
  return {
    language,
    currency: "USD",
    ...(country ? { country } : {}),
  }
}

export function readPreferencesFromStorage(): UserPreferences | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(PREFERENCE_STORAGE_KEY)
    if (!raw) return null
    return parsePreferences(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writePreferencesToStorage(p: UserPreferences) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

export function readLanguageUserSet(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(LANGUAGE_USER_SET_KEY) === "1"
  } catch {
    return false
  }
}

export function markLanguageUserSet(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LANGUAGE_USER_SET_KEY, "1")
  } catch {
    /* ignore */
  }
}

export function preferencesFromUserMetadata(meta: Record<string, unknown> | undefined): Partial<UserPreferences> {
  if (!meta) return {}
  const language = meta.preferred_language ?? meta.preferredLanguage
  const currency = meta.preferred_currency ?? meta.preferredCurrency
  const countryRaw = meta.funding_country_code ?? meta.fundingCountryCode
  const country =
    typeof countryRaw === "string" ? countryRaw.trim().toUpperCase().slice(0, 2) : ""
  return {
    ...(typeof language === "string" ? { language: normalizeAppLanguage(language) } : {}),
    ...(typeof currency === "string" ? { currency: "USD" } : {}),
    ...(country.length === 2 && /^[A-Z]{2}$/.test(country) ? { country } : {}),
  }
}

export function localeForLanguage(lang: AppLanguage): string {
  return lang === "fr" ? "fr-SN" : "en-US"
}
