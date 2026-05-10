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
} from "@/lib/user-preferences"
import { formatMoneyAmount } from "@/lib/currency-display"
import { translateApp } from "@/lib/i18n/app-messages"

type UserPreferencesContextValue = {
  language: AppLanguage
  currency: string
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
    const merged = parsePreferences({
      ...DEFAULT_PREFERENCES,
      ...stored,
      ...fromMeta,
    })
    setPrefs(merged)
  }, [user?.id, user?.user_metadata])

  const setPreferences = useCallback((partial: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const next = parsePreferences({ ...prev, ...partial })
      writePreferencesToStorage(next)
      return next
    })
  }, [])

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
      locale,
      setPreferences,
      formatUserMoney,
      t,
    }),
    [prefs.language, prefs.currency, locale, setPreferences, formatUserMoney, t]
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
