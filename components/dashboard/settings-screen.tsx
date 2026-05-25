"use client"

import { useState, useEffect, useCallback } from "react"
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
  Link2,
  ArrowDownUp,
  MapPin,
} from "lucide-react"
import { ExchangeBinding } from "./exchange-binding"
import { UserSecuritySetupForm } from "@/components/dashboard/user-security-setup-form"
import { UserSecurityRecoverySummary } from "@/components/dashboard/user-security-recovery-summary"
import { SecurityAppealCenter } from "@/components/dashboard/security-appeal-center"
import {
  fetchSecurityNeedsSetupPassive,
  readCachedNeedsSetup,
  securityProfileDebug,
} from "@/lib/nexus-security-profile-client"
import { DepositWithdraw } from "./deposit-withdraw"
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

type LearnerMessage = { id: string; role: "user" | "assistant"; content: string }
type SessionItem = {
  id: string
  device_name: string
  browser_name: string
  status: string
  device_trust?: string
  ip_address?: string | null
  first_seen_at: string
  last_seen_at: string
  revoked_at?: string | null
  is_current: boolean
  is_online: boolean
}

export type SettingsView =
  | "main"
  | "security"
  | "security-appeal"
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
  | "exchanges"
  | "deposit-withdraw"

interface SettingItem {
  key: SettingsView
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
  const [regionMessage, setRegionMessage] = useState<string | null>(null)
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
  const [securityNeedsSetup, setSecurityNeedsSetup] = useState(false)
  const [securityProfileRefresh, setSecurityProfileRefresh] = useState(0)

  const refreshSecurityProfileState = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      securityProfileDebug("settings_refresh_start")
      const result = await fetchSecurityNeedsSetupPassive(token)
      setSecurityNeedsSetup(result.needsSetup)
      setSecurityProfileRefresh((n) => n + 1)
      securityProfileDebug("settings_refresh_finish", { needsSetup: result.needsSetup })
    } catch {
      /* ignore */
    }
  }, [])
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([])
  const [sessionsMessage, setSessionsMessage] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [antiPhishingCode, setAntiPhishingCode] = useState("")
  const [antiPhishingSaved, setAntiPhishingSaved] = useState<string | null>(null)
  const [antiPhishingMessage, setAntiPhishingMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      const code =
        typeof data.user?.user_metadata?.anti_phishing_code === "string"
          ? data.user.user_metadata.anti_phishing_code.trim()
          : ""
      setAntiPhishingSaved(code || null)
      setAntiPhishingCode(code)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const cached = readCachedNeedsSetup()
    if (cached !== null) setSecurityNeedsSetup(cached)
  }, [])

  useEffect(() => {
    if (currentView !== "security" && currentView !== "security-appeal") return
    void refreshSecurityProfileState()
  }, [currentView, refreshSecurityProfileState])

  useEffect(() => {
    let cancelled = false
    const loadSessions = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const ssRes = await fetch("/api/user/sessions", {
          headers: { Authorization: `Bearer ${token}` },
        })
        const ssData = (await ssRes.json().catch(() => ({}))) as { items?: SessionItem[] }
        if (!cancelled && ssRes.ok) setSessionItems(ssData.items ?? [])
      } catch {
        /* ignore transient failures */
      }
    }
    void loadSessions()
    return () => {
      cancelled = true
    }
  }, [])

  async function saveAntiPhishingCode() {
    setAntiPhishingMessage(null)
    const trimmed = antiPhishingCode.trim()
    if (trimmed.length < 4 || trimmed.length > 32) {
      setAntiPhishingMessage("Use 4–32 characters (letters and numbers).")
      return
    }
    try {
      const { error } = await supabase.auth.updateUser({
        data: { anti_phishing_code: trimmed },
      })
      if (error) throw error
      setAntiPhishingSaved(trimmed)
      setAntiPhishingMessage("Anti-phishing code saved. It will appear in emails from us.")
    } catch (e) {
      setAntiPhishingMessage(e instanceof Error ? e.message : "Could not save code")
    }
  }

  async function sessionAction(sessionId: string, action: "trust" | "block") {
    setSessionsMessage(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired. Please sign in again.")
      const res = await fetch("/api/user/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId, action }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(out.error || "Could not update session")
      setSessionItems((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                device_trust: action === "trust" ? "trusted" : "blocked",
                status: action === "block" ? "revoked" : s.status,
                is_online: action === "block" ? false : s.is_online,
              }
            : s,
        ),
      )
      setSessionsMessage(action === "trust" ? "Device marked as trusted." : "Device blocked and session revoked.")
    } catch (e) {
      setSessionsMessage(e instanceof Error ? e.message : "Could not update session")
    }
  }

  async function changePassword() {
    setPasswordMessage(null)
    if (!currentPassword || !newPassword) {
      setPasswordMessage("Current password and new password are required.")
      return
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired. Please sign in again.")
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) throw new Error(out.error || "Could not change password")
      setCurrentPassword("")
      setNewPassword("")
      setPasswordMessage(out.message || "Password changed.")
    } catch (e) {
      setPasswordMessage(e instanceof Error ? e.message : "Could not change password")
    }
  }

  useEffect(() => {
    if (!requestedView) return
    setCurrentView(requestedView)
    onRequestViewConsumed?.()
  }, [requestedView, onRequestViewConsumed])

  const languageLabel = LANGUAGE_OPTIONS.find((o) => o.code === appLanguage)?.label ?? appLanguage
  const currencyLabel = CURRENCY_OPTIONS.find((o) => o.code === appCurrency)?.label ?? appCurrency
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
    { key: "exchanges", icon: <Link2 className="h-5 w-5" />, label: t("settings.menu.exchanges"), description: t("settings.menu.exchangesDesc"), badge: "New" },
    { key: "security", icon: <Shield className="h-5 w-5" />, label: t("settings.menu.security"), description: t("settings.menu.securityDesc").replace("{{level}}", String(securityLevel)), badge: securityLevel < 3 ? "Setup" : undefined },
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
      onClick={() => setCurrentView("main")}
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
        {securityNeedsSetup && (
          <Card className="border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-semibold text-warning">Complete Security & Recovery</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Set your Nexus Security Code and payout numbers before funding or withdrawing.
            </p>
            <Button size="sm" className="mt-3" onClick={() => setCurrentView("security")}>
              Open Security & Recovery
            </Button>
          </Card>
        )}
        <Card className="border-border bg-card p-6">
          <h2 className="mb-6 text-xl font-semibold">Settings</h2>
          <div className="space-y-1">
            {settingsItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setCurrentView(item.key)}
                className="flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-muted"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
                    {item.icon}
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.label}</p>
                      {item.badge && (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            ))}
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

  // Security View — setup OR summary only (appeals are a separate route)
  if (currentView === "security") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        {securityNeedsSetup ? (
          <UserSecuritySetupForm
            variant="settings"
            onComplete={() => void refreshSecurityProfileState()}
          />
        ) : (
          <UserSecurityRecoverySummary
            key={securityProfileRefresh}
            onOpenAppealCenter={() => setCurrentView("security-appeal")}
          />
        )}
        <Card className="border-border bg-card p-4 sm:p-6">
          <h3 className="mb-3 text-lg font-semibold">Anti-Phishing Code</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            A personal phrase you expect in genuine Nexus PRO emails.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={antiPhishingCode}
              onChange={(e) => setAntiPhishingCode(e.target.value)}
              placeholder="e.g. BlueRiver42"
              maxLength={32}
            />
            <Button size="sm" className="shrink-0" onClick={() => void saveAntiPhishingCode()}>
              {antiPhishingSaved ? "Update" : "Save"}
            </Button>
          </div>
          {antiPhishingSaved ? (
            <p className="mt-2 text-xs text-success">Active: {antiPhishingSaved}</p>
          ) : null}
          {antiPhishingMessage ? <p className="mt-2 text-xs text-muted-foreground">{antiPhishingMessage}</p> : null}
        </Card>
        <Card className="border-border bg-card p-6">
          <h3 className="mb-2 text-lg font-semibold">{t("security.devices.title")}</h3>
          <p className="mb-3 text-xs text-muted-foreground">{t("security.devices.hint")}</p>
          <div className="max-h-[min(320px,45vh)] overflow-y-auto rounded-lg border border-border/80 bg-muted/20 p-2">
            <div className="space-y-2 pr-1">
              {sessionItems.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">No devices recorded yet.</p>
              ) : (
                sessionItems.map((s) => (
                  <div key={s.id} className="rounded-lg bg-background/80 px-3 py-2.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {s.device_name} · {s.browser_name}
                          {s.is_current ? (
                            <span className="ml-2 text-[10px] font-semibold text-primary">(this device)</span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {s.is_online ? "Online" : "Offline"} · Last active{" "}
                          {new Date(s.last_seen_at).toLocaleString()}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {t("security.devices.ip")}: {s.ip_address?.trim() || "—"}
                        </p>
                        {s.device_trust === "trusted" ? (
                          <p className="mt-1 text-[10px] font-medium text-success">{t("security.devices.trusted")}</p>
                        ) : s.device_trust === "blocked" || s.status === "revoked" ? (
                          <p className="mt-1 text-[10px] font-medium text-destructive">{t("security.devices.blocked")}</p>
                        ) : null}
                      </div>
                      {!s.is_current && s.status === "active" ? (
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => void sessionAction(s.id, "trust")}>
                            {t("security.devices.trust")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => void sessionAction(s.id, "block")}
                          >
                            {t("security.devices.block")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {sessionsMessage ? <p className="mt-2 text-xs text-muted-foreground">{sessionsMessage}</p> : null}
        </Card>
                <Card className="border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Change Password</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Enter your current password first. If unknown, use account recovery with your Nexus Security Code.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 8 chars)" />
          </div>
          <Button className="mt-3" size="sm" onClick={() => void changePassword()}>
            Update password
          </Button>
          {passwordMessage ? <p className="mt-2 text-xs text-muted-foreground">{passwordMessage}</p> : null}
        </Card>
      </div>
    )
  }

  if (currentView === "security-appeal") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setCurrentView("security")}
          className="mb-1 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground touch-manipulation"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Security & Recovery
        </button>
        <SecurityAppealCenter />
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

  // Connected Exchanges
  if (currentView === "exchanges") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <h2 className="text-lg font-semibold">Connected Exchanges</h2>
        <p className="text-sm text-muted-foreground">
          Link exchange for balance display. Read-only API keys recommended. Disconnect
          anytime from this screen.
        </p>
        <ExchangeBinding />
      </div>
    )
  }

  // Deposit & Withdraw
  if (currentView === "deposit-withdraw") {
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <h2 className="text-lg font-semibold">Deposit & Withdraw</h2>
        <DepositWithdraw
          securityLevel={securityLevel}
          balance={mainBalance}
          showBalanceBanner={false}
          onTransaction={(type, amount, method) => {
            console.log(`[v0] ${type} ${amount} via ${method}`)
          }}
          onRequireSecurityUpgrade={() => setCurrentView("security")}
        />
      </div>
    )
  }

  // Currency Selection
  if (currentView === "currency") {
    const corridorLocked = customerCurrencyOptionsForCountry(appCountry ?? null)
    const currencyChoices =
      corridorLocked != null
        ? CURRENCY_OPTIONS.filter((opt) => corridorLocked.includes(opt.code as FiatCurrencyCode))
        : CURRENCY_OPTIONS
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">{t("settings.currencyTitle")}</h3>
          {corridorLocked != null ? (
            <p className="mb-4 text-sm text-muted-foreground">
              {t("settings.currencyCorridorLocked").replace("{{currency}}", corridorLocked[0] ?? appCurrency)}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {currencyChoices.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  setPreferences({ currency: opt.code as FiatCurrencyCode })
                  setCurrentView("main")
                }}
                className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                  appCurrency === opt.code ? "bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                {appCurrency === opt.code && <Check className="h-5 w-5" />}
              </button>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  // Language Selection
  if (currentView === "language") {
    const languageChoices = customerLanguageChoicesForCountry(appCountry ?? null)
    const languageCorridorLocked = languageChoices.length === 1
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">{t("settings.languageTitle")}</h3>
          {languageCorridorLocked ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Your operating country uses English only for account and funding screens.
            </p>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">{t("settings.languageHint")}</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {languageChoices.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  setPreferences({ language: opt.code as AppLanguage })
                  setCurrentView("main")
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
                  setCurrentView("main")
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
                  setCurrentView("main")
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
