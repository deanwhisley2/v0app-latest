"use client"

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { createPortal } from "react-dom"
import Link from "next/link"
import {
  X,
  Bell,
  Settings,
  TrendingUp,
  Zap,
  Gift,
  Shield,
  Volume2,
  VolumeX,
  Moon,
  Sun,
  Globe,
  Trash2,
  CheckCheck,
  Info,
  History,
  ChevronRight,
  Compass,
  Landmark,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { useNexusNotifications, type NexusNotificationItem, type NexusNotificationType } from "@/contexts/NexusNotificationsContext"
import { NotificationSwipeRow } from "./notification-swipe-row"
import { formatNotificationTimeAgo, presentNotification } from "@/lib/notifications/notification-inbox-presenter"
import { NotificationInboxEmpty, NotificationInboxRow } from "@/components/dashboard/notification-inbox-ui"
import { cn } from "@/lib/utils"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { isMobileLowGpuMode } from "@/lib/mobile/mobile-low-gpu-mode"

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
}

const getTypeIcon = (type: NexusNotificationType) => {
  switch (type) {
    case "price":
      return <TrendingUp className="h-4 w-4 text-success" />
    case "trade":
      return <Zap className="h-4 w-4 text-primary" />
    case "security":
      return <Shield className="h-4 w-4 text-warning" />
    case "promo":
      return <Gift className="h-4 w-4 text-accent" />
    case "system":
      return <Info className="h-4 w-4 text-muted-foreground" />
    case "analysis":
      return <Compass className="h-4 w-4 text-cyan-400" />
    case "financial":
      return <Landmark className="h-4 w-4 text-emerald-400" />
  }
}

const getTypeColor = (type: NexusNotificationType) => {
  switch (type) {
    case "price":
      return "border-l-success"
    case "trade":
      return "border-l-primary"
    case "security":
      return "border-l-warning"
    case "promo":
      return "border-l-accent"
    case "system":
      return "border-l-muted-foreground"
    case "analysis":
      return "border-l-cyan-400"
    case "financial":
      return "border-l-emerald-400"
  }
}

const INBOX_ROW_EST = 80
const INBOX_WINDOW_OVERSCAN = 8
/** Below this count, render the full list (avoids pad/spacer flicker on small inboxes). */
const INBOX_VIRTUAL_MIN = 100

type InboxRowProps = {
  notification: NexusNotificationItem
  onActivate: (n: NexusNotificationItem) => void
  onSwipeRight: () => void
  onSwipeLeft: () => void
}

function PanelDetailOverlay({ detail, onClose }: { detail: NexusNotificationItem; onClose: () => void }) {
  const { t, currency, country, locale } = useUserPreferences()
  const p = presentNotification(detail, t, {
    fundingCountryCode: country ?? null,
    displayCurrency: currency,
    locale,
  })
  return (
    <div className="absolute inset-0 z-[110] flex flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
        <h4 className="truncate pr-2 text-sm font-semibold tracking-tight">{p.title}</h4>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
        <div className="rounded-xl border border-border/45 bg-muted/12 px-3 py-3">
          <p className="text-[13px] font-medium leading-snug text-foreground">{p.summary}</p>
        </div>
        <p className="mt-4 text-sm leading-[1.6] text-foreground/90">{p.detail}</p>
        <div className="mt-5 border-t border-border/35 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/65">
            {t("notifications.inbox.detailRecorded")}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground/85">
            {new Date(detail.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
        {p.metaLine ? (
          <div className="mt-4 rounded-lg border border-border/35 bg-muted/10 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
              {t("notifications.inbox.detailContext")}
            </p>
            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground/75">{p.metaLine}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const InboxRow = memo(function InboxRow({ notification, onActivate, onSwipeRight, onSwipeLeft }: InboxRowProps) {
  const { t, currency, country, locale } = useUserPreferences()
  const flatGpu = isMobileLowGpuMode()
  const p = presentNotification(notification, t, {
    fundingCountryCode: country ?? null,
    displayCurrency: currency,
    locale,
  })
  const row = (
    <NotificationInboxRow
      item={notification}
      presented={p}
      onOpen={() => onActivate(notification)}
      className="rounded-xl [contain-intrinsic-size:76px_1px]"
    />
  )
  if (flatGpu) {
    return <div className="mb-1.5">{row}</div>
  }
  return (
    <NotificationSwipeRow
      className="mb-1.5"
      onSwipeRight={onSwipeRight}
      onSwipeLeft={onSwipeLeft}
      deleteLabel={t("notifications.center.delete")}
      archiveLabel={t("notifications.center.archive")}
    >
      {row}
    </NotificationSwipeRow>
  )
})

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { t } = useUserPreferences()
  const {
    inbox,
    accountInboxReady,
    unreadCount,
    markRead,
    markAllRead,
    clearInbox,
    deleteFromInbox,
    archiveFromInbox,
    runAppNavigation,
  } = useNexusNotifications()

  const { resolvedTheme, setTheme } = useTheme()
  const isDarkTheme = resolvedTheme !== "light"

  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({
    sound: true,
    priceAlerts: true,
    tradeAlerts: true,
    securityAlerts: true,
    promoAlerts: false,
    systemAlerts: true,
    language: "English",
  })
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<NexusNotificationItem | null>(null)

  useBodyScrollLock(isOpen)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, onClose])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (detail) setDetail(null)
        else onClose()
      }
    }
    if (isOpen) document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, onClose, detail])

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const onItemActivate = useCallback(
    (n: NexusNotificationItem) => {
      markRead(n.id)
      if (n.nav && n.nav.kind !== "detail") {
        runAppNavigation(n.nav)
        onClose()
      } else {
        setDetail(n)
      }
    },
    [markRead, onClose, runAppNavigation]
  )

  const scrollRaf = useRef<number | null>(null)
  const [vWindow, setVWindow] = useState({ start: 0, end: 60 })

  const recomputeWindow = useCallback(() => {
    const el = listRef.current
    const n = inbox.length
    if (!el || n < INBOX_VIRTUAL_MIN) {
      setVWindow((w) => (w.start !== 0 || w.end !== n ? { start: 0, end: n } : w))
      return
    }
    const top = el.scrollTop
    const vh = el.clientHeight
    const start = Math.max(0, Math.floor(top / INBOX_ROW_EST) - INBOX_WINDOW_OVERSCAN)
    const end = Math.min(n, Math.ceil((top + vh) / INBOX_ROW_EST) + INBOX_WINDOW_OVERSCAN)
    setVWindow((w) => (w.start !== start || w.end !== end ? { start, end } : w))
  }, [inbox.length])

  useLayoutEffect(() => {
    if (!isOpen || showSettings) return
    recomputeWindow()
  }, [isOpen, showSettings, inbox.length, recomputeWindow])

  useEffect(() => {
    const el = listRef.current
    if (!el || !isOpen || showSettings) return
    const onScroll = () => {
      if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current)
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = null
        recomputeWindow()
      })
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", onScroll)
      if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current)
    }
  }, [isOpen, showSettings, recomputeWindow])

  const useVirtualInbox = inbox.length >= INBOX_VIRTUAL_MIN && !isMobileLowGpuMode()

  const visibleInbox = useMemo(
    () => (useVirtualInbox ? inbox.slice(vWindow.start, vWindow.end) : inbox),
    [inbox, useVirtualInbox, vWindow.end, vWindow.start]
  )

  const topPad = useVirtualInbox ? vWindow.start * INBOX_ROW_EST : 0
  const bottomPad = useVirtualInbox ? Math.max(0, inbox.length - vWindow.end) * INBOX_ROW_EST : 0

  if (!isOpen || !mounted) return null

  return createPortal(
    <>
      <div
        className="nexus-overlay-scrim nexus-notification-portal fixed inset-0 z-[104] bg-foreground/25 backdrop-blur-[2px] dark:bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="nexus-notification-portal nexus-notification-panel fixed bottom-4 left-4 right-4 z-[105] flex min-h-0 max-h-[min(100dvh-2rem,600px)] w-auto flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] sm:left-auto sm:right-4 sm:max-w-[380px] sm:w-[min(380px,calc(100%-2rem))]"
      >
      <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Bell className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight">{t("nav.notifications")}</h3>
              <p className="truncate text-[10px] text-muted-foreground">{t("notifications.inbox.panelSubtitle")}</p>
            </div>
            {unreadCount > 0 ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold tabular-nums text-primary">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSettings(!showSettings)}>
              <Settings className={cn("h-4 w-4 transition-transform", showSettings ? "rotate-90" : "")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!showSettings && inbox.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CheckCheck className="h-3 w-3" />
              {t("notifications.center.markAllRead")}
            </button>
            <button
              type="button"
              onClick={clearInbox}
              className="inline-flex items-center gap-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              {t("notifications.center.clearInbox")}
            </button>
          </div>
        )}
      </div>

      {showSettings ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4">
          <h4 className="mb-4 text-sm font-semibold text-muted-foreground">SETTINGS</h4>
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {settings.sound ? (
                  <Volume2 className="h-5 w-5 text-primary" />
                ) : (
                  <VolumeX className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">Sound</p>
                  <p className="text-xs text-muted-foreground">Play notification sounds</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
                className={`relative h-6 w-11 rounded-full transition-colors ${settings.sound ? "bg-primary" : "bg-muted"}`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                    settings.sound ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
          <div className="mb-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">ALERT TYPES</p>
            {[
              { key: "priceAlerts" as const, label: "Price Alerts", icon: TrendingUp },
              { key: "tradeAlerts" as const, label: "Trade Confirmations", icon: Zap },
              { key: "securityAlerts" as const, label: "Security Alerts", icon: Shield },
              { key: "promoAlerts" as const, label: "Promotions", icon: Gift },
              { key: "systemAlerts" as const, label: "System Updates", icon: Info },
            ].map(({ key, label, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, [key]: !s[key] }))}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    settings[key] ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      settings[key] ? "left-4" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
          <div className="mb-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">APPEARANCE</p>
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5">
              <div className="flex items-center gap-2">
                {isDarkTheme ? (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Sun className="h-4 w-4 text-warning" />
                )}
                <span className="text-sm">Dark Mode</span>
              </div>
              <button
                type="button"
                onClick={() => setTheme(isDarkTheme ? "light" : "dark")}
                className={`relative h-5 w-9 rounded-full transition-colors ${isDarkTheme ? "bg-primary" : "bg-muted"}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    isDarkTheme ? "left-4" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Language</span>
              </div>
              <select
                value={settings.language}
                onChange={(e) => setSettings((s) => ({ ...s, language: e.target.value }))}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
              >
                <option>English</option>
                <option>Spanish</option>
                <option>Chinese</option>
              </select>
            </div>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <h5 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
              <Info className="h-4 w-4" />
              Gestures
            </h5>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                Swipe right to dismiss from your inbox. Account and transaction alerts stay on the compliance record for
                administrators even after you clear them here.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                Swipe left to archive local items (moves to history) or mark server-backed items as read.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                Tap a notification to open the linked screen or full details.
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            className="nexus-scroll-isolated min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-0.5 [scrollbar-gutter:stable]"
          >
            <div className="p-2 pb-1">
              {!accountInboxReady ? (
                <div className="space-y-2 px-2 py-4" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-[72px] animate-pulse rounded-xl bg-muted/30" />
                  ))}
                </div>
              ) : inbox.length === 0 ? (
                <NotificationInboxEmpty
                  message={t("notifications.inbox.panelEmpty")}
                  hint={t("notifications.inbox.panelEmptyHint")}
                  className="py-10"
                />
              ) : (
                <>
                  {topPad > 0 ? <div className="w-full" style={{ height: topPad }} aria-hidden /> : null}
                  {visibleInbox.map((notification) => (
                    <InboxRow
                      key={notification.id}
                      notification={notification}
                      onActivate={onItemActivate}
                      onSwipeRight={() => deleteFromInbox(notification.id)}
                      onSwipeLeft={() => archiveFromInbox(notification.id)}
                    />
                  ))}
                  {bottomPad > 0 ? <div className="w-full" style={{ height: bottomPad }} aria-hidden /> : null}
                </>
              )}
            </div>
          </div>
          {!showSettings && inbox.length > 0 && (
            <div className="shrink-0 border-t border-border bg-muted/20 px-2 py-2">
              <Link
                href="/dashboard/notifications"
                onClick={onClose}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-foreground/90 transition-colors hover:bg-muted/40"
              >
                <History className="h-3.5 w-3.5 shrink-0" />
                View all notifications
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </Link>
              <p className="mt-0.5 text-center text-[10px] text-muted-foreground/80">Scroll the list above for older items in your inbox</p>
            </div>
          )}
        </>
      )}

      {detail ? <PanelDetailOverlay detail={detail} onClose={() => setDetail(null)} /> : null}
    </div>
    </>,
    document.body
  )
}
