"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/contexts/AuthContext"
import {
  DEFAULT_PREFERENCES,
  type AppLanguage,
  type UserPreferences,
  parsePreferences,
  readPreferencesFromStorage,
  writePreferencesToStorage,
  preferencesFromUserMetadata,
  localeForLanguage,
  markLanguageUserSet,
} from "@/lib/user-preferences"
import { formatMoneyAmount } from "@/lib/currency-display"
import { mergeCustomerPreferencesWithCorridor } from "@/lib/customer-display-currency"
import { translateApp } from "@/lib/i18n/app-messages"
import { supabase } from "@/lib/supabaseClient"

type UserPreferencesContextValue = {
  language: AppLanguage
  currency: string
  /** ISO2 operating country when set (funding corridors, regional pairing). */
  country: string | null
  locale: string
  setPreferences: (p: Partial<UserPreferences>) => void
  /** Ledger/API balances are **USD-normalized**; this converts to the user’s display fiat only. Never pass raw local input here. */
  formatUserMoney: (amountUsd: number) => string
  /** Translate UI keys from `lib/i18n/app-messages.ts` (e.g. `nav.trade`). */
  t: (key: string) => string
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | undefined>(undefined)

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const stored = typeof window !== "undefined" ? readPreferencesFromStorage() : null
    return stored ?? { ...DEFAULT_PREFERENCES }
  })

  useEffect(() => {
    const stored = readPreferencesFromStorage()
    const fromMeta = user?.user_metadata
      ? preferencesFromUserMetadata(user.user_metadata as Record<string, unknown>)
      : {}
    const base = parsePreferences({
      ...DEFAULT_PREFERENCES,
      ...stored,
      ...fromMeta,
    })
    const merged = mergeCustomerPreferencesWithCorridor(base, base.country ?? null)
    setPrefs(merged)
    writePreferencesToStorage(merged)
  }, [user?.id, user?.user_metadata])

  /** When the user has not set a country in local preferences, mirror `profiles.funding_country_code` for regional UX. */
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      const stored = readPreferencesFromStorage()
      const storedCountry =
        stored && typeof stored.country === "string" ? stored.country.trim().toUpperCase() : ""
      if (storedCountry.length === 2) return

      const { data, error } = await supabase
        .from("profiles")
        .select("funding_country_code")
        .eq("id", user.id)
        .maybeSingle()
      if (cancelled || error) return
      const raw = (data as { funding_country_code?: string | null })?.funding_country_code?.trim().toUpperCase()
      if (!raw || raw.length !== 2) return

      setPrefs((prev) => {
        const next = mergeCustomerPreferencesWithCorridor(parsePreferences({ ...prev, country: raw }), raw)
        if (
          next.country === prev.country &&
          next.currency === prev.currency &&
          next.language === prev.language
        ) {
          return prev
        }
        writePreferencesToStorage(next)
        const meta = user?.user_metadata as Record<string, unknown> | undefined
        const metaCur = meta?.preferred_currency ?? meta?.preferredCurrency
        const metaLang = meta?.preferred_language ?? meta?.preferredLanguage
        const metaPatch: Record<string, string> = {}
        if (next.currency !== metaCur) metaPatch.preferred_currency = String(next.currency)
        if (next.language !== metaLang) metaPatch.preferred_language = String(next.language)
        if (Object.keys(metaPatch).length > 0) {
          void supabase.auth.updateUser({ data: metaPatch })
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const setPreferences = useCallback((partial: Partial<UserPreferences>) => {
    if (partial.language) markLanguageUserSet()
    setPrefs((prev) => {
      const next = parsePreferences({ ...prev, ...partial })
      writePreferencesToStorage(next)
      if (partial.language && user?.id) {
        void supabase.auth.updateUser({ data: { preferred_language: next.language } })
      }
      if (partial.currency && user?.id) {
        void supabase.auth.updateUser({ data: { preferred_currency: next.currency } })
      }
      return next
    })
  }, [user?.id])

  const locale = useMemo(() => localeForLanguage(prefs.language), [prefs.language])

  useEffect(() => {
    if (typeof document === "undefined") return
    const htmlLang =
      prefs.language === "sw"
        ? "sw"
        : prefs.language === "fr"
          ? "fr"
          : prefs.language === "ar"
            ? "ar"
            : prefs.language === "pt"
              ? "pt"
              : prefs.language === "ha"
                ? "ha"
                : prefs.language === "am"
                  ? "am"
                  : prefs.language === "zu"
                    ? "zu"
                    : prefs.language === "wo"
                      ? "wo"
                      : "en"
    document.documentElement.lang = htmlLang
    document.documentElement.dir = prefs.language === "ar" ? "rtl" : "ltr"
  }, [prefs.language])

  const formatUserMoney = useCallback(
    (amountUsd: number) => formatMoneyAmount(amountUsd, prefs.currency, locale),
    [prefs.currency, locale]
  )

  const t = useCallback(
    (key: string) => translateApp(prefs.language, key),
    [prefs.language]
  )

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      language: prefs.language,
      currency: prefs.currency,
      country: prefs.country ?? null,
      locale,
      setPreferences,
      formatUserMoney,
      t,
    }),
    [prefs.language, prefs.currency, prefs.country, locale, setPreferences, formatUserMoney, t]
  )

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
}

export function useUserPreferences() {
  const ctx = useContext(UserPreferencesContext)
  if (!ctx) {
    throw new Error("useUserPreferences must be used within UserPreferencesProvider")
  }
  return ctx
}
