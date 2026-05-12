import type { FiatCurrencyCode } from "@/lib/currency-display"

export const PREFERENCE_STORAGE_KEY = "nexus_user_preferences"

export type AppLanguage =
  | "en"
  | "sw"
  | "fr"
  | "ar"
  | "pt"
  | "ha"
  | "am"
  | "zu"
  | "wo"

export interface UserPreferences {
  language: AppLanguage
  currency: FiatCurrencyCode | string
  /** ISO 3166-1 alpha-2 operating country (funding corridors, regional UX). Optional. */
  country?: string
}

export const LANGUAGE_OPTIONS: { code: AppLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "sw", label: "Kiswahili" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
  { code: "ha", label: "Hausa" },
  { code: "am", label: "አማርኛ" },
  { code: "zu", label: "isiZulu" },
  { code: "wo", label: "Wolof" },
]

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
]

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: "en",
  currency: "USD",
  country: undefined,
}

export function parsePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES }
  const o = raw as Record<string, unknown>
  const language = typeof o.language === "string" ? (o.language as AppLanguage) : DEFAULT_PREFERENCES.language
  const currency = typeof o.currency === "string" ? o.currency : DEFAULT_PREFERENCES.currency
  const countryRaw = typeof o.country === "string" ? o.country.trim().toUpperCase() : ""
  const country = countryRaw.length === 2 && /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : undefined
  const langOk = LANGUAGE_OPTIONS.some((l) => l.code === language)
  const curOk = CURRENCY_OPTIONS.some((c) => c.code === currency)
  return {
    language: langOk ? language : DEFAULT_PREFERENCES.language,
    currency: curOk ? (currency as FiatCurrencyCode) : DEFAULT_PREFERENCES.currency,
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

export function preferencesFromUserMetadata(meta: Record<string, unknown> | undefined): Partial<UserPreferences> {
  if (!meta) return {}
  const language = meta.preferred_language ?? meta.preferredLanguage
  const currency = meta.preferred_currency ?? meta.preferredCurrency
  return {
    ...(typeof language === "string" ? { language: language as AppLanguage } : {}),
    ...(typeof currency === "string" ? { currency } : {}),
  }
}

export function localeForLanguage(lang: AppLanguage): string {
  const map: Record<AppLanguage, string> = {
    en: "en-US",
    sw: "sw-TZ",
    fr: "fr-SN",
    ar: "ar-EG",
    pt: "pt-MZ",
    ha: "ha-NG",
    am: "am-ET",
    zu: "zu-ZA",
    wo: "wo-SN",
  }
  return map[lang] ?? "en-US"
}
