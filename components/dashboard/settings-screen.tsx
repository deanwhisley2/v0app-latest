"use client"

import { useState, useEffect } from "react"
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
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Banknote,
  X,
  Check,
  ExternalLink,
  LogOut,
  Link2,
  ArrowDownUp,
} from "lucide-react"
import { ExchangeBinding } from "./exchange-binding"
import { SecurityCenter } from "./security-center"
import { DepositWithdraw } from "./deposit-withdraw"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabaseClient"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { CURRENCY_OPTIONS, LANGUAGE_OPTIONS, type AppLanguage } from "@/lib/user-preferences"
import type { FiatCurrencyCode } from "@/lib/currency-display"
import { getNexusAssistantWelcome } from "@/lib/nexus-assistant"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"

type LearnerMessage = { id: string; role: "user" | "assistant"; content: string }

export type SettingsView =
  | "main"
  | "security"
  | "notifications"
  | "nexus-learner"
  | "currency"
  | "language"
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
}

export function SettingsScreen({
  onLogout,
  requestedView,
  onRequestViewConsumed,
  isGuestSession = false,
  tradingUserLevel = 1,
}: SettingsScreenProps) {
  const { t, language: appLanguage, currency: appCurrency, setPreferences } = useUserPreferences()
  const [currentView, setCurrentView] = useState<SettingsView>("main")
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark")
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
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [selfieLoading, setSelfieLoading] = useState(false)
  const [selfieError, setSelfieError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadSelfie = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch("/api/user/security-selfie", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = (await res.json().catch(() => ({}))) as {
          hasSelfie?: boolean
          avatarUrl?: string | null
        }
        if (!cancelled) setSelfieUrl(data.hasSelfie ? data.avatarUrl ?? null : null)
      } catch {
        /* ignore */
      }
    }
    void loadSelfie()
    return () => {
      cancelled = true
    }
  }, [])

  async function uploadSelfie(file: File) {
    if (!file.type.startsWith("image/")) {
      setSelfieError("Please choose an image file.")
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setSelfieError("Selfie image must be 3MB or smaller.")
      return
    }
    setSelfieError(null)
    setSelfieLoading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = () => reject(new Error("Could not read image"))
        reader.readAsDataURL(file)
      })
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Not authenticated")
      const res = await fetch("/api/user/security-selfie", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ avatar_url: dataUrl }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(out.error || "Could not save selfie")
      setSelfieUrl(dataUrl)
    } catch (e) {
      setSelfieError(e instanceof Error ? e.message : "Could not upload selfie")
    } finally {
      setSelfieLoading(false)
    }
  }

  useEffect(() => {
    if (!requestedView) return
    setCurrentView(requestedView)
    onRequestViewConsumed?.()
  }, [requestedView, onRequestViewConsumed])

  const languageLabel = LANGUAGE_OPTIONS.find((o) => o.code === appLanguage)?.label ?? appLanguage
  const currencyLabel = CURRENCY_OPTIONS.find((o) => o.code === appCurrency)?.label ?? appCurrency

  const settingsItems: SettingItem[] = [
    { key: "exchanges", icon: <Link2 className="h-5 w-5" />, label: "Connected Exchanges", description: "Binance, Bybit, Bitget, etc.", badge: "New" },
    { key: "security", icon: <Shield className="h-5 w-5" />, label: "Security Center", description: `Level ${securityLevel} of 3`, badge: securityLevel < 3 ? "Setup" : undefined },
    { key: "deposit-withdraw", icon: <ArrowDownUp className="h-5 w-5" />, label: "Deposit & Withdraw", description: "Add or withdraw funds" },
    { key: "notifications", icon: <Bell className="h-5 w-5" />, label: "Notifications", description: "Alerts and push settings" },
    { key: "nexus-learner", icon: <MessageCircle className="h-5 w-5" />, label: "Joelin", description: "Nexus PRO product & trust guide" },
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
    { key: "theme", icon: <Palette className="h-5 w-5" />, label: "Theme", description: theme.charAt(0).toUpperCase() + theme.slice(1) },
    { key: "wire-currency", icon: <Banknote className="h-5 w-5" />, label: "Direct Wire Currency", description: wireCurrency },
    { key: "payment-methods", icon: <CreditCard className="h-5 w-5" />, label: "Payment Methods", description: "Cards and bank accounts" },
    { key: "privacy", icon: <Lock className="h-5 w-5" />, label: "Privacy Center", description: "Data and privacy settings" },
    { key: "about", icon: <Info className="h-5 w-5" />, label: "About Us", description: "App info and legal" },
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
    return (
      <div className="space-y-4">
        {!selfieUrl && (
          <Card className="border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-semibold text-warning">Security required: add your selfie now</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Without a registered selfie, recovery and fund-protection checks are weaker. Open Security Center and enroll your selfie.
            </p>
            <Button size="sm" className="mt-3" onClick={() => setCurrentView("security")}>
              Go to Security Center
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

        {/* Check Updates */}
        <Card className="border-border bg-card p-4">
          <button className="flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-muted">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="font-medium">Check for Updates</p>
                <p className="text-sm text-muted-foreground">Version 2.4.1 (Latest)</p>
              </div>
            </div>
            <Check className="h-5 w-5 text-success" />
          </button>
        </Card>

        {/* Logout Button */}
        {onLogout && (
          <Card className="border-destructive/30 bg-card p-4">
            <button
              type="button"
              onClick={() => void Promise.resolve(onLogout())}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              <LogOut className="h-5 w-5" />
              Log Out
            </button>
          </Card>
        )}
      </div>
    )
  }

  // Security View
  if (currentView === "security") {
    const securityItems = [
      { label: "Two-Factor Authentication", status: "Enabled", enabled: true },
      { label: "Biometric Login", status: "Disabled", enabled: false },
      { label: "Anti-Phishing Code", status: "Set", enabled: true },
      { label: "Withdrawal Whitelist", status: "3 addresses", enabled: true },
      { label: "Device Management", status: "2 devices", enabled: true },
      { label: "Login Password", status: "Change", enabled: true },
    ]

    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className={`p-4 ${selfieUrl ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10"}`}>
          <h3 className="font-semibold">
            {selfieUrl ? "Selfie security is active" : "Selfie required for fund security"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Selfie verification protects account recovery and reduces impersonation risk.
          </p>
          {selfieUrl ? (
            <img src={selfieUrl} alt="Registered selfie" className="mt-3 h-24 w-24 rounded-xl border border-border object-cover" />
          ) : null}
          <div className="mt-3">
            <Input
              type="file"
              accept="image/*"
              capture="user"
              disabled={selfieLoading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                void uploadSelfie(file)
              }}
            />
            {selfieError ? <p className="mt-2 text-xs text-destructive">{selfieError}</p> : null}
            {selfieLoading ? <p className="mt-2 text-xs text-muted-foreground">Uploading selfie...</p> : null}
          </div>
        </Card>
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">Security Settings</h3>
          <div className="space-y-3">
            {securityItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-4"
              >
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className={`text-sm ${item.enabled ? "text-success" : "text-muted-foreground"}`}>
                    {item.status}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            ))}
          </div>
        </Card>
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
    const serverSideUi = process.env.NEXT_PUBLIC_ALLOW_SERVER_SIDE_EXECUTION_UI === "1"
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <h2 className="text-lg font-semibold">Connected Exchanges</h2>
        <p className="text-sm text-muted-foreground">
          Connect your exchange accounts to trade directly from Nexus using NEX automation and Joelin when you need guidance.
        </p>
        {(isGuestSession || serverSideUi) && (
          <Card className="border-primary/35 bg-primary/5 p-4 text-sm leading-relaxed">
            <p className="font-medium text-foreground">Guest / terminal + live spot</p>
            <p className="mt-2 text-muted-foreground">
              Orders from scripts or{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">curl</code> to{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/trade/execute</code> use{" "}
              <strong>server</strong> env <code className="text-xs">BINANCE_API_KEY</code> and{" "}
              <code className="text-xs">BINANCE_SECRET_KEY</code> on the host running Next.js (plus{" "}
              <code className="text-xs">NEXUS_REAL_TRADING=1</code> and{" "}
              <code className="text-xs">NEXUS_REAL_TRADE_SECRET</code>). Keys you paste below stay in this browser for
              balances and desk UI only.
            </p>
            {serverSideUi && (
              <p className="mt-2 text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1">NEXT_PUBLIC_ALLOW_SERVER_SIDE_EXECUTION_UI=1</code> is set —
                Wall Street real-trade banners assume server keys are configured even without a linked exchange here.
              </p>
            )}
          </Card>
        )}
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
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">{t("settings.currencyTitle")}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {CURRENCY_OPTIONS.map((opt) => (
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
    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">{t("settings.languageTitle")}</h3>
          <p className="mb-4 text-sm text-muted-foreground">{t("settings.languageHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {LANGUAGE_OPTIONS.map((opt) => (
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

  // Theme Selection
  if (currentView === "theme") {
    const themes = [
      { key: "dark", label: "Dark", description: "Dark background with light text" },
      { key: "light", label: "Light", description: "Light background with dark text" },
      { key: "system", label: "System", description: "Follow system preference" },
    ]

    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">Theme</h3>
          <div className="space-y-2">
            {themes.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTheme(t.key as typeof theme); setCurrentView("main") }}
                className={`flex w-full items-center justify-between rounded-lg px-4 py-4 transition-colors ${
                  theme === t.key ? "bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <div className="text-left">
                  <p className="font-medium">{t.label}</p>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                </div>
                {theme === t.key && <Check className="h-5 w-5" />}
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
    const paymentMethods = [
      { type: "Visa", last4: "4242", expiry: "12/25" },
      { type: "Mastercard", last4: "8888", expiry: "08/26" },
    ]

    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">Payment Methods</h3>
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div
                key={method.last4}
                className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-4"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-medium">{method.type} ****{method.last4}</p>
                    <p className="text-sm text-muted-foreground">Expires {method.expiry}</p>
                  </div>
                </div>
                <button className="text-sm text-destructive hover:underline">Remove</button>
              </div>
            ))}
            <Button variant="outline" className="w-full">
              <CreditCard className="mr-2 h-4 w-4" />
              Add Payment Method
            </Button>
          </div>
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
                <p className="text-sm text-muted-foreground">How we handle your data</p>
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
        <Card className="border-border bg-card p-6 text-center">
          <div className="mb-4 flex justify-center">
            <img 
              src="/logo.jpg" 
              alt="Nexus Pro" 
              className="h-24 w-24 rounded-2xl shadow-xl shadow-primary/30"
            />
          </div>
          <h3 className="text-2xl font-black text-primary">NEXUS PRO</h3>
          <p className="mb-4 text-sm text-muted-foreground">Version 2.4.1</p>
          <div className="mb-6 space-y-2 text-sm text-muted-foreground">
            <p>Professional Crypto Trading Platform</p>
            <p>Your trusted partner in digital asset trading</p>
            <p className="text-xs">2024 Nexus Pro. All rights reserved.</p>
          </div>
          <div className="space-y-2">
            <Button variant="outline" className="w-full">Terms of Service</Button>
            <Button variant="outline" className="w-full">Privacy Policy</Button>
            <Button variant="outline" className="w-full">Contact Support</Button>
          </div>
        </Card>
      </div>
    )
  }

  return null
}
