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
import { imageDataUrlToHash, optimizeSelfieUpload, validateSelfieQuality } from "@/lib/selfie-hash"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { CURRENCY_OPTIONS, LANGUAGE_OPTIONS, type AppLanguage } from "@/lib/user-preferences"
import type { FiatCurrencyCode } from "@/lib/currency-display"
import { getNexusAssistantWelcome } from "@/lib/nexus-assistant"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"

type LearnerMessage = { id: string; role: "user" | "assistant"; content: string }
type WhitelistItem = {
  id: string
  kind: "mobile_number" | "crypto_address"
  holder_name: string
  value: string
  label?: string | null
  created_at: string
}
type SessionItem = {
  id: string
  device_name: string
  browser_name: string
  status: string
  first_seen_at: string
  last_seen_at: string
  revoked_at?: string | null
  is_current: boolean
  is_online: boolean
}

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
  const [selfieCompareInfo, setSelfieCompareInfo] = useState<string | null>(null)
  const [whitelistItems, setWhitelistItems] = useState<WhitelistItem[]>([])
  const [whitelistKind, setWhitelistKind] = useState<"mobile_number" | "crypto_address">("mobile_number")
  const [whitelistHolderName, setWhitelistHolderName] = useState("")
  const [whitelistValue, setWhitelistValue] = useState("")
  const [whitelistMessage, setWhitelistMessage] = useState<string | null>(null)
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([])
  const [sessionsMessage, setSessionsMessage] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)

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
        if (!cancelled) {
          const hasSelfie = Boolean(data.hasSelfie)
          setSelfieUrl(hasSelfie ? data.avatarUrl ?? null : null)
          if (hasSelfie) {
            setSelfieCompareInfo("Face added. Recovery selfie security is active.")
          }
        }
      } catch {
        /* ignore */
      }
    }
    void loadSelfie()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadSecurityData = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const [wlRes, ssRes] = await Promise.all([
          fetch("/api/user/withdraw-whitelist", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/user/sessions", { headers: { Authorization: `Bearer ${token}` } }),
        ])
        const wlData = (await wlRes.json().catch(() => ({}))) as { items?: WhitelistItem[]; error?: string }
        const ssData = (await ssRes.json().catch(() => ({}))) as { items?: SessionItem[]; error?: string }
        if (!cancelled) {
          if (wlRes.ok) setWhitelistItems(wlData.items ?? [])
          if (ssRes.ok) setSessionItems(ssData.items ?? [])
        }
      } catch {
        /* ignore transient failures */
      }
    }
    void loadSecurityData()
    return () => {
      cancelled = true
    }
  }, [])

  async function uploadSelfie(file: File) {
    if (!file.type.startsWith("image/")) {
      setSelfieError("Please choose an image file.")
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setSelfieError("Selfie image is too large. Please take a new clear photo.")
      return
    }
    setSelfieError(null)
    setSelfieLoading(true)
    try {
      const dataUrl = await optimizeSelfieUpload(file)
      await validateSelfieQuality(dataUrl)
      const selfieHash = await imageDataUrlToHash(dataUrl)
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error("Session expired. Please sign in again, then upload selfie.")
      }
      if (selfieUrl) {
        const cmpRes = await fetch("/api/user/security-selfie", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ selfie_hash: selfieHash }),
        })
        const cmpData = (await cmpRes.json().catch(() => ({}))) as {
          matched?: boolean
          distance?: number
          threshold?: number
          error?: string
        }
        if (!cmpRes.ok) {
          if (cmpRes.status === 401) {
            throw new Error("Session expired. Please sign in again, then retry selfie verification.")
          }
          throw new Error(cmpData.error || "Could not compare selfie")
        }
        if (!cmpData.matched) {
          throw new Error("Selfie does not match enrolled identity. Use clear face, no hats/covering.")
        }
        setSelfieCompareInfo(
          `Selfie match passed (distance ${cmpData.distance}/${cmpData.threshold}).`
        )
      } else {
        setSelfieCompareInfo("Initial selfie enrolled for account security.")
      }
      const res = await fetch("/api/user/security-selfie", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ avatar_url: dataUrl, selfie_hash: selfieHash }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Session expired. Please sign in again, then upload selfie.")
        }
        throw new Error(out.error || "Could not save selfie")
      }
      setSelfieUrl(dataUrl)
      setSelfieCompareInfo(out.message || "Face added. Recovery selfie security is active.")
    } catch (e) {
      setSelfieError(e instanceof Error ? e.message : "Could not upload selfie")
    } finally {
      setSelfieLoading(false)
    }
  }

  async function addWhitelistEntry() {
    setWhitelistMessage(null)
    if (!whitelistHolderName.trim() || !whitelistValue.trim()) {
      setWhitelistMessage("Holder name and address/number are required.")
      return
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired. Please sign in again.")
      const res = await fetch("/api/user/withdraw-whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: whitelistKind,
          holder_name: whitelistHolderName,
          value: whitelistValue,
        }),
      })
      const out = (await res.json().catch(() => ({}))) as { item?: WhitelistItem; error?: string }
      if (!res.ok) throw new Error(out.error || "Could not add whitelist entry")
      setWhitelistItems((prev) => [out.item as WhitelistItem, ...prev])
      setWhitelistHolderName("")
      setWhitelistValue("")
      setWhitelistMessage("Whitelist entry added.")
    } catch (e) {
      setWhitelistMessage(e instanceof Error ? e.message : "Could not add whitelist entry")
    }
  }

  async function revokeSession(sessionId: string) {
    setSessionsMessage(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired. Please sign in again.")
      const res = await fetch("/api/user/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(out.error || "Could not revoke session")
      setSessionItems((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: "revoked", is_online: false } : s)))
      setSessionsMessage("Session revoked.")
    } catch (e) {
      setSessionsMessage(e instanceof Error ? e.message : "Could not revoke session")
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
      { label: "Withdrawal Whitelist", status: `${whitelistItems.length} active entries`, enabled: true },
      { label: "Device Management", status: `${sessionItems.length} sessions`, enabled: true },
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
          <p className="mt-1 text-xs text-muted-foreground">
            Keep this enabled during setup and account lifetime so no one else can use selfie recovery for your profile.
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
            {selfieCompareInfo ? (
              <p className="mt-2 text-xs text-success">{selfieCompareInfo}</p>
            ) : null}
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
        <Card className="border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Withdrawal Whitelist</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Add-only user flow: you can add up to 3 entries. Removal is admin-only for security.
          </p>
          <div className="mb-4 grid gap-2 md:grid-cols-3">
            <select
              value={whitelistKind}
              onChange={(e) => setWhitelistKind(e.target.value as "mobile_number" | "crypto_address")}
              className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
            >
              <option value="mobile_number">Mobile number</option>
              <option value="crypto_address">Crypto address</option>
            </select>
            <Input value={whitelistHolderName} onChange={(e) => setWhitelistHolderName(e.target.value)} placeholder="Holder name" />
            <Input value={whitelistValue} onChange={(e) => setWhitelistValue(e.target.value)} placeholder={whitelistKind === "mobile_number" ? "+2567..." : "0x..."} />
          </div>
          <Button size="sm" onClick={() => void addWhitelistEntry()} disabled={whitelistItems.length >= 3}>
            Add whitelist entry
          </Button>
          {whitelistMessage ? <p className="mt-2 text-xs text-muted-foreground">{whitelistMessage}</p> : null}
          <div className="mt-4 space-y-2">
            {whitelistItems.map((w) => (
              <div key={w.id} className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">{w.holder_name} - {w.kind === "mobile_number" ? "Mobile" : "Crypto"}</p>
                <p className="font-mono text-xs text-muted-foreground">{w.value}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Device Management</h3>
          <div className="space-y-2">
            {sessionItems.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{s.device_name} - {s.browser_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.is_online ? "Online" : "Offline"} | Last active {new Date(s.last_seen_at).toLocaleString()}
                    {s.is_current ? " | Current device" : ""}
                  </p>
                </div>
                {!s.is_current && s.status === "active" ? (
                  <Button size="sm" variant="outline" onClick={() => void revokeSession(s.id)}>Revoke</Button>
                ) : null}
              </div>
            ))}
          </div>
          {sessionsMessage ? <p className="mt-2 text-xs text-muted-foreground">{sessionsMessage}</p> : null}
        </Card>
        <Card className="border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Change Password</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Enter your current password first. If unknown, use the face recovery fallback path from login.
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
