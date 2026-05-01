"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  X,
  Bell,
  Settings,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
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
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface Notification {
  id: string
  type: "price" | "trade" | "security" | "promo" | "system"
  title: string
  message: string
  timestamp: Date
  read: boolean
  icon?: React.ReactNode
}

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    type: "price",
    title: "BTC Price Alert",
    message: "Bitcoin crossed $68,000 - up 2.4% in the last hour",
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    read: false,
  },
  {
    id: "2",
    type: "trade",
    title: "Order Filled",
    message: "Your BUY order for 0.5 ETH at $3,420 has been executed",
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
    read: false,
  },
  {
    id: "3",
    type: "security",
    title: "New Device Login",
    message: "Login detected from Chrome on Windows. Was this you?",
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    read: true,
  },
  {
    id: "4",
    type: "promo",
    title: "Limited Time Offer",
    message: "Earn 100% APY on USDT staking - 7 days only!",
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
    read: true,
  },
  {
    id: "5",
    type: "system",
    title: "System Maintenance",
    message: "Scheduled maintenance on April 28, 2:00 AM UTC",
    timestamp: new Date(Date.now() - 1000 * 60 * 120),
    read: true,
  },
]

const getTypeIcon = (type: Notification["type"]) => {
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

const getTypeColor = (type: Notification["type"]) => {
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

const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "Just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS)
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
  const [needsScroll, setNeedsScroll] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length

  // Check if the notification list needs scrolling using ResizeObserver
  useEffect(() => {
    const el = listRef.current
    if (!el) return

    const checkScroll = () => {
      setNeedsScroll(el.scrollHeight > el.clientHeight)
    }

    // Initial check
    checkScroll()

    // Use ResizeObserver for reliable size change detection
    const observer = new ResizeObserver(checkScroll)
    observer.observe(el)

    return () => observer.disconnect()
  }, [notifications, showSettings])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }, [])

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  // Lock body scroll when panel is open - prevents background page from scrolling
  useEffect(() => {
    if (isOpen) {
      // Save original overflow value to restore later
      const originalOverflow = document.body.style.overflow
      const originalPosition = document.body.style.position
      const originalWidth = document.body.style.width
      const originalTop = document.body.style.top
      const scrollY = window.scrollY

      // Lock body scroll completely
      document.body.style.overflow = "hidden"
      document.body.style.position = "fixed"
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = "100%"

      return () => {
        // Restore body scroll
        document.body.style.overflow = originalOverflow
        document.body.style.position = originalPosition
        document.body.style.width = originalWidth
        document.body.style.top = originalTop
        window.scrollTo(0, scrollY)
      }
    }
  }, [isOpen])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, onClose])

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
    }
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, onClose])

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      ref={panelRef}
      className="fixed bottom-4 right-4 z-[100] w-[380px] max-h-[600px] animate-in slide-in-from-bottom-5 slide-in-from-right-5 duration-300 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className={`h-4 w-4 transition-transform ${showSettings ? "rotate-90" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
        {!showSettings && notifications.length > 0 && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </button>
            <button
              onClick={clearAll}
              className="flex items-center gap-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings ? (
        <div className="max-h-[500px] overflow-y-auto p-4">
          <h4 className="mb-4 text-sm font-semibold text-muted-foreground">SETTINGS</h4>

          {/* Sound */}
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
                onClick={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  settings.sound ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                    settings.sound ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Alert Types */}
          <div className="mb-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">ALERT TYPES</p>
            {[
              { key: "priceAlerts", label: "Price Alerts", icon: TrendingUp },
              { key: "tradeAlerts", label: "Trade Confirmations", icon: Zap },
              { key: "securityAlerts", label: "Security Alerts", icon: Shield },
              { key: "promoAlerts", label: "Promotions", icon: Gift },
              { key: "systemAlerts", label: "System Updates", icon: Info },
            ].map(({ key, label, icon: Icon }) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{label}</span>
                </div>
                <button
                  onClick={() =>
                    setSettings((s) => ({ ...s, [key]: !s[key as keyof typeof s] }))
                  }
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    settings[key as keyof typeof settings] ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      settings[key as keyof typeof settings] ? "left-4" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          {/* Appearance */}
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
                onClick={() => setSettings((s) => ({ ...s, darkMode: !s.darkMode }))}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  settings.darkMode ? "bg-primary" : "bg-muted"
                }`}
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
                <option>Japanese</option>
                <option>Korean</option>
              </select>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <h5 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
              <Info className="h-4 w-4" />
              Quick Guide
            </h5>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-primary" />
                Swipe left on notifications to delete them
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-primary" />
                Click any notification to view details
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-primary" />
                Enable price alerts to never miss market moves
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-primary" />
                Security alerts cannot be disabled for your protection
              </li>
            </ul>
          </div>
        </div>
      ) : (
        /* Notifications List */
        <div
          ref={listRef}
          className={`max-h-[500px] ${
            needsScroll
              ? "overflow-y-auto overscroll-contain touch-pan-y"
              : "overflow-y-hidden"
          }`}
        >
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="mb-3 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No notifications</p>
              <p className="text-xs text-muted-foreground/70">
                You&apos;re all caught up!
              </p>
            </div>
          ) : (
            <div className="p-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => markAsRead(notification.id)}
                  className={`group relative mb-2 cursor-pointer rounded-xl border-l-4 ${getTypeColor(
                    notification.type
                  )} bg-muted/30 p-3 transition-all hover:bg-muted/50 ${
                    !notification.read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                      {getTypeIcon(notification.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-semibold ${!notification.read ? "text-foreground" : "text-muted-foreground"}`}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <span className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground/70">
                        {formatTimeAgo(notification.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteNotification(notification.id)
                      }}
                      className="absolute right-2 top-2 rounded-full p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              {/* End of list indicator - shown when content fits without scrolling */}
              {!needsScroll && (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground/50">
                  <span className="h-px w-8 bg-border" />
                  <span>You&apos;re all caught up</span>
                  <span className="h-px w-8 bg-border" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
