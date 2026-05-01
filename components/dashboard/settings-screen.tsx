"use client"

import { useState } from "react"
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

type SettingsView = "main" | "security" | "notifications" | "nexus-learner" | "currency" | "language" | "theme" | "wire-currency" | "payment-methods" | "privacy" | "about" | "exchanges" | "deposit-withdraw"

interface SettingItem {
  key: SettingsView
  icon: React.ReactNode
  label: string
  description?: string
  badge?: string
}

interface SettingsScreenProps {
  onLogout?: () => void
}

export function SettingsScreen({ onLogout }: SettingsScreenProps) {
  const [currentView, setCurrentView] = useState<SettingsView>("main")
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark")
  const [language, setLanguage] = useState("English")
  const [currency, setCurrency] = useState("USD")
  const [wireCurrency, setWireCurrency] = useState("USD")
  const [securityLevel, setSecurityLevel] = useState<1 | 2 | 3>(1)
  const [mainBalance] = useState(24831.42)

  const settingsItems: SettingItem[] = [
    { key: "exchanges", icon: <Link2 className="h-5 w-5" />, label: "Connected Exchanges", description: "Binance, Bybit, Bitget, etc.", badge: "New" },
    { key: "security", icon: <Shield className="h-5 w-5" />, label: "Security Center", description: `Level ${securityLevel} of 3`, badge: securityLevel < 3 ? "Setup" : undefined },
    { key: "deposit-withdraw", icon: <ArrowDownUp className="h-5 w-5" />, label: "Deposit & Withdraw", description: "Add or withdraw funds" },
    { key: "notifications", icon: <Bell className="h-5 w-5" />, label: "Notifications", description: "Alerts and push settings" },
    { key: "nexus-learner", icon: <MessageCircle className="h-5 w-5" />, label: "Nexus Learner", description: "Chat with AI agent" },
    { key: "currency", icon: <Wallet className="h-5 w-5" />, label: "Default Currency", description: currency },
    { key: "language", icon: <Globe className="h-5 w-5" />, label: "Language", description: language },
    { key: "theme", icon: <Palette className="h-5 w-5" />, label: "Theme", description: theme.charAt(0).toUpperCase() + theme.slice(1) },
    { key: "wire-currency", icon: <Banknote className="h-5 w-5" />, label: "Direct Wire Currency", description: wireCurrency },
    { key: "payment-methods", icon: <CreditCard className="h-5 w-5" />, label: "Payment Methods", description: "Cards and bank accounts" },
    { key: "privacy", icon: <Lock className="h-5 w-5" />, label: "Privacy Center", description: "Data and privacy settings" },
    { key: "about", icon: <Info className="h-5 w-5" />, label: "About Us", description: "App info and legal" },
  ]

  const languages = ["English", "Spanish", "French", "German", "Chinese", "Japanese", "Korean", "Russian", "Arabic", "Portuguese"]
  const currencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "INR", "KRW"]

  const renderBackButton = () => (
    <button
      onClick={() => setCurrentView("main")}
      className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      Back to Settings
    </button>
  )

  // Main settings list
  if (currentView === "main") {
    return (
      <div className="space-y-4">
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
              onClick={onLogout}
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
    const [notifications, setNotifications] = useState({
      priceAlerts: true,
      tradeConfirmations: true,
      security: true,
      promotions: false,
      news: true,
      sound: true,
    })

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

  // Nexus Learner Chat
  if (currentView === "nexus-learner") {
    const [messages, setMessages] = useState([
      { role: "assistant", content: "Hello! I'm Nexus Learner, your AI trading assistant. How can I help you learn about crypto trading today?" }
    ])
    const [input, setInput] = useState("")

    const sendMessage = () => {
      if (!input.trim()) return
      setMessages([...messages, { role: "user", content: input }])
      setTimeout(() => {
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "That's a great question! Let me explain..." 
        }])
      }, 1000)
      setInput("")
    }

    return (
      <div className="space-y-4">
        {renderBackButton()}
        <Card className="flex h-[500px] flex-col border-border bg-card">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold">Nexus Learner</h3>
            <p className="text-sm text-muted-foreground">AI Trading Assistant</p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about trading..."
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                className="bg-muted/30"
              />
              <Button onClick={sendMessage}>Send</Button>
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
          Connect your exchange accounts to trade directly from Nexus using the NEX AI bot.
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
          <h3 className="mb-6 text-lg font-semibold">Default Currency</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {currencies.map((curr) => (
              <button
                key={curr}
                onClick={() => { setCurrency(curr); setCurrentView("main") }}
                className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                  currency === curr ? "bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <span className="font-medium">{curr}</span>
                {currency === curr && <Check className="h-5 w-5" />}
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
          <h3 className="mb-6 text-lg font-semibold">Language</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => { setLanguage(lang); setCurrentView("main") }}
                className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                  language === lang ? "bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <span className="font-medium">{lang}</span>
                {language === lang && <Check className="h-5 w-5" />}
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
            {currencies.map((curr) => (
              <button
                key={curr}
                onClick={() => { setWireCurrency(curr); setCurrentView("main") }}
                className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                  wireCurrency === curr ? "bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <span className="font-medium">{curr}</span>
                {wireCurrency === curr && <Check className="h-5 w-5" />}
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
