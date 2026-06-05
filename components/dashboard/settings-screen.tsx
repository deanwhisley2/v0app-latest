"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Shield,
  Bell,
  MessageCircle,
  Wallet,
  Globe,
  Palette,
  CreditCard,
  Lock,
  Info,
  ChevronRight,
  ChevronLeft,
  Banknote,
  X,
  Check,
  ExternalLink,
  LogOut,
  ArrowDownUp,
  MapPin,
} from "lucide-react"
import { DepositWithdraw } from "./deposit-withdraw"
import { DepositWithdrawDetailsPanel } from "@/components/dashboard/deposit-withdraw-details-panel"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabaseClient"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { CURRENCY_OPTIONS, LANGUAGE_OPTIONS, type AppLanguage } from "@/lib/user-preferences"
import { OPERATING_COUNTRY_OPTIONS, suggestPreferencesForCountry } from "@/lib/i18n/region-defaults"
import type { FiatCurrencyCode } from "@/lib/currency-display"
import {
  customerCurrencyOptionsForCountry,
  customerLanguageChoicesForCountry,
} from "@/lib/customer-display-currency"
import { getNexusAssistantWelcome } from "@/lib/nexus-assistant"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"
import { resolveNexusTierDefinition } from "@/lib/nexus-tier-matrix"
import { AboutCompanyPanel } from "@/components/dashboard/about-company-panel"
import {
  EmailVerificationSettingsCard,
  useEmailVerificationNeeded,
} from "@/components/dashboard/email-verification-settings-card"

type LearnerMessage = { id: string; role: "user" | "assistant"; content: string }

export type SettingsView =
  | "main"
  | "notifications"
  | "nexus-learner"
  | "currency"
  | "language"
  | "region"
  | "theme"
  | "wire-currency"
  | "payment-methods"
  | "privacy"
  | "about"
  | "deposit-withdraw"

interface SettingItem {
  key: SettingsView | "security"
  href?: string
  icon: React.ReactNode
  label: string
  description?: string
  badge?: string
}

interface SettingsScreenProps {
  onLogout?: () => void | Promise<void>
  /** When set, opens this sub-screen (e.g. from a notification deep link). */
  requestedView?: SettingsView | null
  onRequestViewConsumed?: () => void
  isGuestSession?: boolean
  tradingUserLevel?: number
  /** Level 2 designated retail credit desk (profiles.retailer_credit_seller or env allowlist). */
  retailerCreditDesk?: boolean
}

export function SettingsScreen({
  onLogout,
  requestedView,
  onRequestViewConsumed,
  isGuestSession = false,
  tradingUserLevel = 1,
  retailerCreditDesk = false,
}: SettingsScreenProps) {
  const router = useRouter()
  const { t, language: appLanguage, currency: appCurrency, country: appCountry, setPreferences } = useUserPreferences()
  const { theme = "dark", setTheme } = useTheme()
  const themeChoice = (theme ?? "dark") as "dark" | "light" | "system"
  const themeMenuDescription =
    themeChoice === "light"
      ? t("settings.theme.light")
      : themeChoice === "system"
        ? t("settings.theme.system")
        : t("settings.theme.dark")
  const [currentView, setCurrentView] = useState<SettingsView>("main")
  const historyReadyRef = useRef(false)
  const popNavigatingRef = useRef(false)

  const navigateToView = useCallback((view: SettingsView) => {
    if (view === currentView) return
    if (typeof window !== "undefined" && historyReadyRef.current && !popNavigatingRef.current) {
      window.history.pushState({ nexusSettingsUi: true, view }, "")
    }
    setCurrentView(view)
  }, [currentView])

  const navigateBack = useCallback(() => {
    if (currentView === "main") return
    if (typeof window !== "undefined" && historyReadyRef.current) {
      window.history.back()
      return
    }
    setCurrentView("main")
  }, [currentView])
  const [regionMessage, setRegionMessage] = useState<string | null>(null)
  const emailVerificationNeeded = useEmailVerificationNeeded()
  const [wireCurrency, setWireCurrency] = useState("USD")
  const [securityLevel, setSecurityLevel] = useState<1 | 2 | 3>(1)
  const [mainBalance] = useState(24831.42)
  const [notifications, setNotifications] = useState({
    priceAlerts: true,
    tradeConfirmations: true,
    security: true,
    promotions: false,
    news: true,
    sound: true,
  })
  const [learnerMessages, setLearnerMessages] = useState<LearnerMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      content: getNexusAssistantWelcome("settings_learner", isGuestSession),
    },
  ])
  const [learnerInput, setLearnerInput] = useState("")
  const [learnerTyping, setLearnerTyping] = useState(false)

  useEffect(() => {
    if (!requestedView) return
    navigateToView(requestedView)
    onRequestViewConsumed?.()
  }, [requestedView, onRequestViewConsumed, navigateToView])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!historyReadyRef.current) {
      window.history.replaceState({ nexusSettingsUi: true, view: currentView }, "")
      historyReadyRef.current = true
      return
    }
    if (popNavigatingRef.current) {
      popNavigatingRef.current = false
      return
    }
    window.history.replaceState({ nexusSettingsUi: true, view: currentView }, "")
  }, [currentView])

  useEffect(() => {
    if (typeof window === "undefined") return
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as { nexusSettingsUi?: boolean; view?: SettingsView } | null
      if (!state?.nexusSettingsUi) return
      popNavigatingRef.current = true
      setCurrentView(state.view ?? "main")
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const languageLabel = LANGUAGE_OPTIONS.find((o) => o.code === appLanguage)?.label ?? appLanguage
  const currencyLabel = "USD — US Dollar"
  const countryLabel = appCountry
    ? OPERATING_COUNTRY_OPTIONS.find((o) => o.code === appCountry)?.label ?? appCountry
    : "—"

  async function persistFundingCountry(code: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error("Session expired. Please sign in again.")
    const res = await fetch("/api/user/funding-country", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    })
    const out = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(out.error || "Could not save country")
  }

  const settingsItems: SettingItem[] = [
    {
      key: "security",
      href: "/dashboard/security",
      icon: <Shield className="h-5 w-5" />,
      label: t("settings.menu.security"),
      description: t("settings.menu.securityDesc").replace("{{level}}", String(securityLevel)),
      ...(emailVerificationNeeded ? { badge: "Verify email" } : {}),
    },
    { key: "deposit-withdraw", icon: <ArrowDownUp className="h-5 w-5" />, label: t("settings.menu.depositWithdraw"), description: t("settings.menu.depositWithdrawDesc") },
    { key: "notifications", icon: <Bell className="h-5 w-5" />, label: t("settings.menu.notifications"), description: t("settings.menu.notificationsDesc") },
    { key: "nexus-learner", icon: <MessageCircle className="h-5 w-5" />, label: t("settings.menu.learner"), description: t("settings.menu.learnerDesc") },
    {
      key: "currency",
      icon: <Wallet className="h-5 w-5" />,
      label: t("settings.item.currency"),
      description: currencyLabel,
    },
    {
      key: "language",
      icon: <Globe className="h-5 w-5" />,
      label: t("settings.item.language"),
      description: languageLabel,
    },
    {
      key: "region",
      icon: <MapPin className="h-5 w-5" />,
      label: t("settings.item.region"),
      description: countryLabel,
    },
    { key: "theme", icon: <Palette className="h-5 w-5" />, label: t("settings.menu.theme"), description: themeMenuDescription },
    { key: "wire-currency", icon: <Banknote className="h-5 w-5" />, label: t("settings.menu.wireCurrency"), description: wireCurrency },
    { key: "payment-methods", icon: <CreditCard className="h-5 w-5" />, label: t("settings.menu.paymentMethods"), description: t("settings.menu.paymentMethodsDesc") },
    { key: "privacy", icon: <Lock className="h-5 w-5" />, label: t("settings.menu.privacy"), description: t("settings.menu.privacyDesc") },
    { key: "about", icon: <Info className="h-5 w-5" />, label: t("settings.menu.about"), description: t("settings.menu.aboutDesc") },
  ]

  const renderBackButton = () => (
    <button
      onClick={navigateBack}
      className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      {t("settings.back")}
    </button>
  )

  // Main settings list
  if (currentView === "main") {
    const tier = resolveNexusTierDefinition(tradingUserLevel, retailerCreditDesk)
    return (
      <div className="space-y-4">
        {!isGuestSession && emailVerificationNeeded ? (
          <EmailVerificationSettingsCard variant="settings" />
        ) : null}
        {!isGuestSession && (
          <Card className="border-primary/30 bg-primary/5 p-4">
            <h3 className="text-sm font-semibold text-foreground">{tier.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{tier.summary}</p>
            <ul className="mt-3 space-y-2 text-[11px] leading-snug text-muted-foreground">
              {tier.capabilities.map((line, idx) => (
                <li key={`${tier.key}-${idx}`} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card className="border-border bg-card p-6">
          <h2 className="mb-6 text-xl font-semibold">Settings</h2>
          <div className="space-y-1">
            {settingsItems.map((item) => {
              const inner = (
                <>
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
                      {item.icon}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{item.label}</p>
                        {item.badge ? (
                          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                            {item.badge}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </>
              )
              if (item.href) {
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-muted"
                  >
                    {inner}
                  </Link>
                )
              }
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigateToView(item.key as SettingsView)}
                  className="flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-muted"
                >
                  {inner}
                </button>
              )
            })}
          </div>
        </Card>

        {/* Logout Button */}
        {onLogout && (
          <Card className="overflow-hidden border-destructive/25 bg-card p-0 shadow-sm">
            <button
              type="button"
              onClick={() => void Promise.resolve(onLogout())}
              className="nexus-touch-press flex w-full items-center justify-between gap-3 bg-gradient-to-r from-destructive/12 via-destructive/8 to-transparent px-4 py-4 text-left transition-colors hover:from-destructive/18 active:scale-[0.99] touch-manipulation"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/15 ring-1 ring-destructive/25">
                  <LogOut className="h-5 w-5 text-destructive" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-destructive">Sign out</span>
                  <span className="block text-xs text-muted-foreground">End your session on this device</span>
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-destructive/60" />
            </button>
          </Card>
        )}
      </div>
    )
  }

  // Notifications View
  if (currentView === "notifications") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">Notification Preferences</h3>
          <div className="space-y-4">
            {Object.entries(notifications).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3"
              >
                <span className="capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                <button
                  onClick={() => setNotifications({ ...notifications, [key]: !value })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    value ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      value ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  // Joelin (Settings chat)
  if (currentView === "nexus-learner") {
    const sendMessage = async () => {
      const trimmed = learnerInput.trim()
      if (!trimmed || learnerTyping) return
      const mkId = () =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const userId = mkId()
      const assistantId = mkId()
      setLearnerMessages((prev) => [...prev, { id: userId, role: "user", content: trimmed }])
      setLearnerInput("")
      setLearnerTyping(true)
      try {
        const reply = await requestNexusAssistantReply({
          userMessage: trimmed,
          surface: "settings_learner",
          isGuest: isGuestSession,
          tradingUserLevel,
        })
        setLearnerMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: reply }])
      } finally {
        setLearnerTyping(false)
      }
    }

    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="flex h-[500px] flex-col border-border bg-card">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold">Joelin</h3>
            <p className="text-sm text-muted-foreground">Nexus PRO guide — product & trust only</p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {learnerMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            ))}
            {learnerTyping && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted/80 px-4 py-2 text-xs text-muted-foreground">
                  Joelin is typing…
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <Input
                value={learnerInput}
                onChange={(e) => setLearnerInput(e.target.value)}
                placeholder="Ask about Nexus PRO (try: help, exchange, security, funding)…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                disabled={learnerTyping}
                className="bg-muted/30"
              />
              <Button onClick={sendMessage} disabled={learnerTyping || !learnerInput.trim()}>
                Send
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // Deposit & Withdraw
  if (currentView === "deposit-withdraw") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <h2 className="text-lg font-semibold">Deposit & Withdraw</h2>
        <DepositWithdrawDetailsPanel />
      </div>
    )
  }

  // Display currency (USD only — local fiat appears on Add Funds / Withdraw only)
  if (currentView === "currency") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">{t("settings.currencyTitle")}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All balances, trading, earnings, referrals, and history are shown in{" "}
            <strong className="text-foreground">USD</strong>. When you add funds or withdraw through
            mobile money, you enter your local amount and we show the USD equivalent for your ledger.
          </p>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3 text-primary">
            <span className="font-medium">USD — US Dollar</span>
            <Check className="h-5 w-5" />
          </div>
        </Card>
      </div>
    )
  }

  // Language Selection
  if (currentView === "language") {
    const languageChoices = customerLanguageChoicesForCountry(appCountry ?? null)
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">{t("settings.languageTitle")}</h3>
          <p className="mb-4 text-sm text-muted-foreground">{t("settings.languageHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {languageChoices.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  setPreferences({ language: opt.code as AppLanguage })
                  navigateBack()
                }}
                className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                  appLanguage === opt.code ? "bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                {appLanguage === opt.code && <Check className="h-5 w-5" />}
              </button>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  if (currentView === "region") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">{t("settings.regionTitle")}</h3>
          <p className="mb-4 text-sm text-muted-foreground">{t("settings.regionHint")}</p>
          {regionMessage ? (
            <p
              className={`mb-4 text-sm ${regionMessage.includes("Could not") || regionMessage.includes("expired") ? "text-destructive" : "text-success"}`}
            >
              {regionMessage}
            </p>
          ) : null}
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {OPERATING_COUNTRY_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  void (async () => {
                    setRegionMessage(null)
                    try {
                      await persistFundingCountry(opt.code)
                      const suggested = suggestPreferencesForCountry(opt.code)
                      setPreferences({ country: opt.code, ...suggested })
                      setRegionMessage(t("settings.regionSaved"))
                    } catch (e) {
                      setRegionMessage(e instanceof Error ? e.message : "Could not save")
                    }
                  })()
                }}
                className={`flex min-h-[48px] items-center justify-between rounded-lg px-4 py-3 text-left transition-colors ${
                  appCountry === opt.code ? "bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                {appCountry === opt.code ? <Check className="h-5 w-5 shrink-0" /> : null}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.regionApplySuggestion")}</p>
        </Card>
      </div>
    )
  }

  // Theme Selection
  if (currentView === "theme") {
    const themeOptions = [
      { key: "dark" as const, label: t("settings.theme.dark"), description: t("settings.theme.darkDesc") },
      { key: "light" as const, label: t("settings.theme.light"), description: t("settings.theme.lightDesc") },
      { key: "system" as const, label: t("settings.theme.system"), description: t("settings.theme.systemDesc") },
    ]

    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold text-foreground">{t("settings.menu.theme")}</h3>
          <div className="space-y-2">
            {themeOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setTheme(option.key)
                  navigateBack()
                }}
                className={`flex w-full items-center justify-between rounded-lg px-4 py-4 transition-colors ${
                  themeChoice === option.key ? "bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <div className="text-left">
                  <p className="font-medium">{option.label}</p>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
                {themeChoice === option.key && <Check className="h-5 w-5" />}
              </button>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  // Wire Currency
  if (currentView === "wire-currency") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">Direct Wire Currency</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Select your preferred currency for direct wire transfers.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CURRENCY_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  setWireCurrency(opt.code)
                  navigateBack()
                }}
                className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                  wireCurrency === opt.code ? "bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                {wireCurrency === opt.code && <Check className="h-5 w-5" />}
              </button>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  // Payment Methods
  if (currentView === "payment-methods") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-3 text-lg font-semibold">Payment Methods</h3>
          <p className="text-sm text-muted-foreground">
            Card/bank rails are intentionally disabled in this phase. Use retailer or crypto/mobile flows only.
          </p>
        </Card>
      </div>
    )
  }

  // Privacy Center
  if (currentView === "privacy") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">Privacy Center</h3>
          <div className="space-y-4">
            <button className="flex w-full items-center justify-between rounded-lg bg-muted/30 px-4 py-4 hover:bg-muted/50">
              <div>
                <p className="font-medium">Download My Data</p>
                <p className="text-sm text-muted-foreground">Export all your account data</p>
              </div>
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
            </button>
            <button className="flex w-full items-center justify-between rounded-lg bg-muted/30 px-4 py-4 hover:bg-muted/50">
              <div>
                <p className="font-medium">Privacy Policy</p>
                <p className="text-sm text-muted-foreground">Data handling policy</p>
              </div>
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
            </button>
            <button className="flex w-full items-center justify-between rounded-lg bg-destructive/10 px-4 py-4 text-destructive hover:bg-destructive/20">
              <div className="text-left">
                <p className="font-medium">Delete Account</p>
                <p className="text-sm opacity-80">Permanently remove your account</p>
              </div>
              <X className="h-5 w-5" />
            </button>
          </div>
        </Card>
      </div>
    )
  }

  // About Us
  if (currentView === "about") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <AboutCompanyPanel />
      </div>
    )
  }

  return null
}
