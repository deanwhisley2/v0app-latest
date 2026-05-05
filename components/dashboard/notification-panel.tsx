"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useNexusNotifications, type NexusNotificationItem, type NexusNotificationType } from "@/contexts/NexusNotificationsContext"
import { NotificationSwipeRow } from "./notification-swipe-row"
import { cn } from "@/lib/utils"

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
  }
}

const formatTimeAgo = (iso: string) => {
  const date = new Date(iso)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "Just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const {
    inbox,
    unreadCount,
    markRead,
    markAllRead,
    clearInbox,
    deleteFromInbox,
    archiveFromInbox,
    runAppNavigation,
  } = useNexusNotifications()

  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({
    sound: true,
    priceAlerts: true,
    tradeAlerts: true,
    securityAlerts: true,
    promoAlerts: false,
    systemAlerts: true,
    darkMode: true,
    language: "English",
  })
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<NexusNotificationItem | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    const scrollY = window.scrollY
    document.body.style.overflow = "hidden"
    document.body.style.position = "fixed"
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = "100%"
    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.position = ""
      document.body.style.top = ""
      document.body.style.width = ""
      window.scrollTo(0, scrollY)
    }
  }, [isOpen])

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

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      ref={panelRef}
      className="fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,380px)] max-h-[min(100dvh-2rem,600px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-5 slide-in-from-right-5 duration-300"
    >
      <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Bell className="h-5 w-5 shrink-0 text-primary" />
            <h3 className="truncate font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                {unreadCount}
              </span>
            )}
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
              Mark read
            </button>
            <button
              type="button"
              onClick={clearInbox}
              className="inline-flex items-center gap-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}
      </div>

      {showSettings ? (
        <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth overscroll-y-contain p-4">
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
                {settings.darkMode ? (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Sun className="h-4 w-4 text-warning" />
                )}
                <span className="text-sm">Dark Mode</span>
              </div>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, darkMode: !s.darkMode }))}
                className={`relative h-5 w-9 rounded-full transition-colors ${settings.darkMode ? "bg-primary" : "bg-muted"}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    settings.darkMode ? "left-4" : "left-0.5"
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
                Swipe right on a row to delete (moves to history).
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                Swipe left to archive and mark as read.
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
            className="nexus-scroll-isolated min-h-0 flex-1 scroll-smooth touch-pan-y pr-0.5 [scrollbar-gutter:stable]"
          >
            <div className="p-2 pb-1">
              {inbox.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="mb-3 h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">No notifications</p>
                  <p className="text-xs text-muted-foreground/70">You&apos;re all caught up</p>
                  <Link
                    href="/dashboard/notifications"
                    onClick={onClose}
                    className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <History className="h-3.5 w-3.5" />
                    View all notifications
                    <ChevronRight className="h-3 w-3 opacity-70" />
                  </Link>
                </div>
              ) : (
                inbox.map((notification) => (
                  <NotificationSwipeRow
                    key={notification.id}
                    className="mb-2"
                    onSwipeRight={() => deleteFromInbox(notification.id)}
                    onSwipeLeft={() => archiveFromInbox(notification.id)}
                  >
                    <button
                      type="button"
                      onClick={() => onItemActivate(notification)}
                      className={cn(
                        "group relative w-full rounded-xl border-l-4 bg-muted/30 p-3 text-left transition-all hover:bg-muted/50",
                        getTypeColor(notification.type),
                        !notification.read && "bg-primary/5"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          {getTypeIcon(notification.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={cn(
                                "text-sm font-semibold",
                                !notification.read ? "text-foreground" : "text-muted-foreground"
                              )}
                            >
                              {notification.title}
                            </p>
                            {!notification.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground/70">
                            {formatTimeAgo(notification.timestamp)}
                            {notification.nav && notification.nav.kind !== "detail" && (
                              <span className="ml-2 text-primary/90">· Open</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </button>
                  </NotificationSwipeRow>
                ))
              )}
            </div>
          </div>
          {!showSettings && inbox.length > 0 && (
            <div className="shrink-0 border-t border-border bg-muted/20 px-2 py-2">
              <Link
                href="/dashboard/notifications"
                onClick={onClose}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
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

      {detail && (
        <div className="absolute inset-0 z-[110] flex flex-col bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h4 className="truncate pr-2 text-sm font-semibold">{detail.title}</h4>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setDetail(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-muted-foreground">
            <p className="whitespace-pre-wrap text-foreground/90">{detail.message}</p>
            <p className="mt-4 text-xs">{formatTimeAgo(detail.timestamp)}</p>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
