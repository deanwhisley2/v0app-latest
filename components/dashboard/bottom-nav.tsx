"use client"

import { useMemo, useState, useCallback } from "react"
import {
  Home,
  TrendingUp,
  Wallet,
  Settings,
  Zap,
} from "lucide-react"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { TRADING_USER_LEVEL } from "@/lib/trading-user-level"
import { getNexusAssistantWelcome } from "@/lib/nexus-assistant"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"

interface BottomNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isGuestSession?: boolean
  /** Liquidity admin / retailer desk — only Wallet + Settings. */
  operationalWorkspace?: boolean
}

const navDefs = [
  { id: "container", icon: Home, labelKey: "nav.container", color: "from-blue-500 to-cyan-500" },
  { id: "wallstreet", icon: TrendingUp, labelKey: "nav.wallstreet", color: "from-purple-500 to-pink-500" },
  { id: "wallet", icon: Wallet, labelKey: "nav.wallet", color: "from-green-500 to-emerald-500" },
  { id: "settings", icon: Settings, labelKey: "nav.settings", color: "from-orange-500 to-amber-500" },
] as const

type MiniMsg = { id: string; role: "user" | "assistant"; content: string }

export function BottomNav({
  activeTab,
  onTabChange,
  isGuestSession = false,
  operationalWorkspace = false,
}: BottomNavProps) {
  const { t } = useUserPreferences()
  const [showJoelinPanel, setShowJoelinPanel] = useState(false)
  const [miniMessages, setMiniMessages] = useState<MiniMsg[]>(() => [
    {
      id: "w",
      role: "assistant",
      content: getNexusAssistantWelcome("bottom_nav_mini", isGuestSession),
    },
  ])
  const [miniInput, setMiniInput] = useState("")
  const [miniBusy, setMiniBusy] = useState(false)

  const sendMini = useCallback(async () => {
    const raw = miniInput.trim()
    if (!raw || miniBusy) return
    const uid = `u-${Date.now()}`
    const aid = `a-${Date.now()}`
    setMiniMessages((m) => [...m, { id: uid, role: "user", content: raw }])
    setMiniInput("")
    setMiniBusy(true)
    try {
      const reply = await requestNexusAssistantReply({
        userMessage: raw,
        surface: "bottom_nav_mini",
        isGuest: isGuestSession,
        tradingUserLevel: TRADING_USER_LEVEL,
      })
      setMiniMessages((m) => [...m, { id: aid, role: "assistant", content: reply }])
    } finally {
      setMiniBusy(false)
    }
  }, [miniInput, miniBusy, isGuestSession])

  const navItems = useMemo(() => {
    const defs = operationalWorkspace
      ? navDefs.filter((d) => d.id === "wallet" || d.id === "settings")
      : navDefs
    return defs.map((d) => ({ ...d, label: t(d.labelKey) }))
  }, [t, operationalWorkspace])

  return (
    <>
      {/* Joelin floating entry — hidden for operational finance roles */}
      {!operationalWorkspace && (
      <button
        onClick={() => setShowJoelinPanel(!showJoelinPanel)}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-lg active:scale-95"
      >
        <Zap className="h-5 w-5 text-white" />
      </button>
      )}

      {/* Joelin mini panel */}
      {!operationalWorkspace && showJoelinPanel && (
        <div className="fixed bottom-36 right-4 z-50 w-72 rounded-2xl border border-border bg-card p-4 shadow-2xl md:hidden">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">{t("bottom.assistantTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("bottom.assistantSubtitle")}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{t("bottom.assistantWelcome")}</p>
          <div className="mb-2 max-h-28 space-y-1.5 overflow-y-auto text-[11px] leading-snug">
            {miniMessages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg px-2 py-1.5 ${msg.role === "user" ? "ml-4 bg-primary/15 text-right" : "mr-4 bg-muted/80"}`}
              >
                <p className="whitespace-pre-wrap break-words text-left">{msg.content}</p>
              </div>
            ))}
            {miniBusy && <p className="text-[10px] text-muted-foreground">…</p>}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={miniInput}
              onChange={(e) => setMiniInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void sendMini()
                }
              }}
              disabled={miniBusy}
              placeholder={t("bottom.askPlaceholder")}
              className="flex-1 rounded-lg bg-muted px-3 py-2 text-xs outline-none disabled:opacity-50"
            />
            <button
              type="button"
              disabled={miniBusy || !miniInput.trim()}
              onClick={() => void sendMini()}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {t("bottom.send")}
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card md:hidden">
        <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
          {navItems.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className="flex flex-1 flex-col items-center gap-1 py-1"
              >
                {/* Icon Container */}
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    isActive
                      ? `bg-gradient-to-br ${item.color} shadow-md -translate-y-1`
                      : "bg-transparent"
                  }`}
                >
                  <item.icon
                    className={`h-5 w-5 ${
                      isActive ? "text-white" : "text-muted-foreground"
                    }`}
                  />
                </div>
                {/* Label */}
                <span
                  className={`text-[10px] font-medium ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
