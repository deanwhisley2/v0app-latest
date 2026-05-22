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
import { localeForCustomerCorridor } from "@/lib/customer-corridor-money"
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

  /** Hydrate language/currency/country: profile funding_country_code is authoritative over stale localStorage. */
  useEffect(() => {
    if (!user?.id) {
      const stored = readPreferencesFromStorage()
      const base = parsePreferences({ ...DEFAULT_PREFERENCES, ...stored })
      setPrefs(mergeCustomerPreferencesWithCorridor(base, null))
      return
    }

    let cancelled = false
    const fromMeta = preferencesFromUserMetadata(user.user_metadata as Record<string, unknown>)

    ;(async () => {
      const stored = readPreferencesFromStorage()
      const { data: prof, error } = await supabase
        .from("profiles")
        .select("funding_country_code")
        .eq("id", user.id)
        .maybeSingle()

      if (cancelled) return

      const profileCountry = !error
        ? (prof as { funding_country_code?: string | null } | null)?.funding_country_code
            ?.trim()
            .toUpperCase()
            .slice(0, 2) ?? ""
        : ""

      const base = parsePreferences({
        ...DEFAULT_PREFERENCES,
        ...stored,
        ...fromMeta,
      })

      const authoritativeCountry =
        profileCountry.length === 2 ? profileCountry : fromMeta.country ?? base.country ?? null

      const next = mergeCustomerPreferencesWithCorridor(base, authoritativeCountry)

      setPrefs(next)
      writePreferencesToStorage(next)

      const meta = user.user_metadata as Record<string, unknown> | undefined
      const metaPatch: Record<string, string> = {}
      if (authoritativeCountry && authoritativeCountry !== fromMeta.country) {
        metaPatch.funding_country_code = authoritativeCountry
      }
      const metaCur = meta?.preferred_currency ?? meta?.preferredCurrency
      const metaLang = meta?.preferred_language ?? meta?.preferredLanguage
      if (next.currency !== metaCur) metaPatch.preferred_currency = String(next.currency)
      if (next.language !== metaLang) metaPatch.preferred_language = String(next.language)
      if (Object.keys(metaPatch).length > 0) {
        void supabase.auth.updateUser({ data: metaPatch })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id, user?.user_metadata])

  const setPreferences = useCallback((partial: Partial<UserPreferences>) => {
    if (partial.language) markLanguageUserSet()
    setPrefs((prev) => {
      const mergedPartial = { ...partial }
      const corridorCountry = (partial.country ?? prev.country)?.trim().toUpperCase().slice(0, 2)
      if (corridorCountry === "KE") {
        mergedPartial.language = "en"
        if (partial.currency) {
          mergedPartial.currency = "KES"
        }
      }
      const next = mergeCustomerPreferencesWithCorridor(
        parsePreferences({ ...prev, ...mergedPartial }),
        corridorCountry || prev.country || null,
      )
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

  const locale = useMemo(
    () => localeForCustomerCorridor(prefs.country ?? null, prefs.language),
    [prefs.country, prefs.language],
  )

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
