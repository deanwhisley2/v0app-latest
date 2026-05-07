"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useOperationalBootstrap } from "@/contexts/OperationalBootstrapContext"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import type {
  NexusNotificationItem,
  NexusNotificationType,
} from "@/lib/nexus-notification-models"
import { broadcastOperationalBump } from "@/lib/nexus-operational-sync-broadcast"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import {
  coerceOperationalPreferences,
  type OperationalPreferencesV1,
} from "@/lib/operational-preferences-types"
import { supabase } from "@/lib/supabaseClient"

export type {
  NexusNotificationType,
  AnalysisNotificationPayload,
  NexusNotificationItem,
} from "@/lib/nexus-notification-models"

export type UiChromePreferences = OperationalPreferencesV1["uiChrome"]

/** Bump when seed shape changes so dev/demo inbox refreshes without manual clear. */
const STORAGE_KEY = "nexus_notifications_v2"

function iso(d: Date) {
  return d.toISOString()
}

function seedInbox(): NexusNotificationItem[] {
  const types: NexusNotificationType[] = ["price", "trade", "security", "promo", "system"]
  const symbols = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT", "MATIC"]
  const count = 22
  const items: NexusNotificationItem[] = []

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length]
    const sym = symbols[i % symbols.length]
    const minutesAgo = 2 + i * 4
    const read = i > 6

    let title = ""
    let message = ""
    let nav: NexusNotificationNav | undefined

    switch (type) {
      case "price":
        title = `${sym} price move`
        message = `${sym} moved sharply in the last hour — open chart to review.`
        nav = { kind: "trade", symbol: sym }
        break
      case "trade":
        title = i % 2 === 0 ? "Order filled" : "Order partially filled"
        message = `Limit ${i % 2 === 0 ? "BUY" : "SELL"} on ${sym} — size and venue in Orders.`
        nav = { kind: "orders" }
        break
      case "security":
        title = "Security notice"
        message = `Activity #${i + 1}: review login or API key usage in Security Center.`
        nav = { kind: "settings", view: "security" }
        break
      case "promo":
        title = "Promo & rewards"
        message = `Limited offer ${i + 1} — tap Wallet for eligibility and terms.`
        nav = { kind: "wallet" }
        break
      case "system":
      default:
        title = "System update"
        message = `Platform notice ${i + 1}: maintenance windows and status updates.`
        nav = { kind: "settings", view: "about" }
        break
    }

    items.push({
      id: `seed-${i + 1}`,
      type,
      title,
      message,
      timestamp: iso(new Date(Date.now() - 1000 * 60 * minutesAgo)),
      read,
      nav,
    })
  }

  return items
}

function seedHistory(): NexusNotificationItem[] {
  const days = [1, 2, 3, 5, 7, 10, 14, 21]
  return days.map((d, i) => ({
    id: `h-${i}`,
    type: "system" as const,
    title: "Weekly summary",
    message: `Portfolio snapshot from ${d} day(s) ago is ready to review.`,
    timestamp: iso(new Date(Date.now() - 86400000 * d)),
    read: true,
    nav: { kind: "detail" },
  }))
}

function loadPersisted(): { inbox: NexusNotificationItem[]; history: NexusNotificationItem[] } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as { inbox?: NexusNotificationItem[]; history?: NexusNotificationItem[] }
    if (!Array.isArray(j.inbox)) return null
    return {
      inbox: j.inbox,
      history: Array.isArray(j.history) ? j.history : [],
    }
  } catch {
    return null
  }
}

function savePersisted(inbox: NexusNotificationItem[], history: NexusNotificationItem[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ inbox, history }))
  } catch {
    /* ignore */
  }
}

type NavigatorFn = (nav: NexusNotificationNav) => void

type NexusNotificationsContextValue = {
  inbox: NexusNotificationItem[]
  history: NexusNotificationItem[]
  unreadCount: number
  registerAppNavigator: (fn: NavigatorFn | null) => void
  runAppNavigation: (nav: NexusNotificationNav) => void
  markRead: (id: string) => void
  markAllRead: () => void
  deleteFromInbox: (id: string) => void
  archiveFromInbox: (id: string) => void
  clearInbox: () => void
  addNotification: (item: Omit<NexusNotificationItem, "id" | "timestamp" | "read"> & { id?: string; timestamp?: string }) => string
  deleteFromHistory: (id: string) => void
  clearHistory: () => void
}

const NexusNotificationsContext = createContext<NexusNotificationsContextValue | null>(null)

export function NexusNotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isGuestSession } = useAuth()
  const { snapshot, isLoading: bootLoading } = useOperationalBootstrap()
  const [inbox, setInbox] = useState<NexusNotificationItem[]>([])
  const [history, setHistory] = useState<NexusNotificationItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const navRef = useRef<NavigatorFn | null>(null)
  const hadLocalPersistedRef = useRef(false)
  const seedCapturedRef = useRef(false)
  const initialSeedSigRef = useRef("")
  const serverNotifSerializedRef = useRef("")
  const lastPostedJsonRef = useRef("")
  const persistPrefsTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const persisted = loadPersisted()
    hadLocalPersistedRef.current = !!persisted
    if (persisted) {
      setInbox(persisted.inbox)
      setHistory(persisted.history)
    } else {
      setInbox(seedInbox())
      setHistory(seedHistory())
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    savePersisted(inbox, history)
  }, [inbox, history, hydrated])

  useEffect(() => {
    if (!hydrated) return
    if (seedCapturedRef.current) return
    seedCapturedRef.current = true
    initialSeedSigRef.current = JSON.stringify({ inbox, history })
  }, [hydrated, inbox, history])

  useEffect(() => {
    if (!hydrated) return
    if (!user?.id || isGuestSession || isDevLocalOnly()) return
    if (bootLoading) return
    const prefs = coerceOperationalPreferences(snapshot?.operationalPreferences ?? null)
    const n = prefs?.notifications
    const count = (n?.inbox?.length ?? 0) + (n?.history?.length ?? 0)
    if (!n || count === 0) return
    const ser = JSON.stringify(n)
    if (ser === serverNotifSerializedRef.current) return
    serverNotifSerializedRef.current = ser
    lastPostedJsonRef.current = ser
    setInbox(n.inbox ?? [])
    setHistory(n.history ?? [])
  }, [hydrated, user?.id, isGuestSession, bootLoading, snapshot?.operationalPreferences])

  useEffect(() => {
    if (!hydrated) return
    if (!user?.id || isGuestSession || isDevLocalOnly()) return
    const ser = JSON.stringify({ inbox, history })
    const initial = initialSeedSigRef.current
    const unchangedDemo = !hadLocalPersistedRef.current && !!initial && ser === initial
    if (unchangedDemo) return
    if (ser === lastPostedJsonRef.current) return

    if (persistPrefsTimerRef.current) window.clearTimeout(persistPrefsTimerRef.current)
    persistPrefsTimerRef.current = window.setTimeout(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const patch: Partial<OperationalPreferencesV1> = {
          v: 1,
          notifications: { inbox, history },
        }
        const res = await fetch("/api/user/operational-preferences", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ patch }),
        })
        if (!res.ok) return
        lastPostedJsonRef.current = ser
        broadcastOperationalBump("notifications")
      } catch {
        /* ignore */
      }
    }, 950)

    return () => {
      if (persistPrefsTimerRef.current) window.clearTimeout(persistPrefsTimerRef.current)
    }
  }, [hydrated, inbox, history, user?.id, isGuestSession])

  const registerAppNavigator = useCallback((fn: NavigatorFn | null) => {
    navRef.current = fn
  }, [])

  const runAppNavigation = useCallback((nav: NexusNotificationNav) => {
    navRef.current?.(nav)
  }, [])

  const unreadCount = useMemo(() => inbox.filter((n) => !n.read).length, [inbox])

  const markRead = useCallback((id: string) => {
    setInbox((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const markAllRead = useCallback(() => {
    setInbox((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const deleteFromInbox = useCallback((id: string) => {
    setInbox((prev) => {
      const hit = prev.find((n) => n.id === id)
      const next = prev.filter((n) => n.id !== id)
      if (hit) {
        setHistory((h) => [{ ...hit, read: true }, ...h])
      }
      return next
    })
  }, [])

  const archiveFromInbox = useCallback((id: string) => {
    setInbox((prev) => {
      const hit = prev.find((n) => n.id === id)
      if (!hit) return prev
      const archived: NexusNotificationItem = { ...hit, read: true }
      setHistory((h) => [archived, ...h])
      return prev.filter((n) => n.id !== id)
    })
  }, [])

  const clearInbox = useCallback(() => {
    setInbox((prev) => {
      setHistory((h) => [...prev.map((n) => ({ ...n, read: true })), ...h])
      return []
    })
  }, [])

  const addNotification = useCallback(
    (item: Omit<NexusNotificationItem, "id" | "timestamp" | "read"> & { id?: string; timestamp?: string }) => {
      const createdId = item.id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const nextItem: NexusNotificationItem = {
        ...item,
        id: createdId,
        timestamp: item.timestamp ?? new Date().toISOString(),
        read: false,
      }
      setInbox((prev) => [nextItem, ...prev])
      return createdId
    },
    []
  )

  const deleteFromHistory = useCallback((id: string) => {
    setHistory((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const value = useMemo<NexusNotificationsContextValue>(
    () => ({
      inbox,
      history,
      unreadCount,
      registerAppNavigator,
      runAppNavigation,
      markRead,
      markAllRead,
      deleteFromInbox,
      archiveFromInbox,
      clearInbox,
      addNotification,
      deleteFromHistory,
      clearHistory,
    }),
    [
      inbox,
      history,
      unreadCount,
      registerAppNavigator,
      runAppNavigation,
      markRead,
      markAllRead,
      deleteFromInbox,
      archiveFromInbox,
      clearInbox,
      addNotification,
      deleteFromHistory,
      clearHistory,
    ]
  )

  return <NexusNotificationsContext.Provider value={value}>{children}</NexusNotificationsContext.Provider>
}

export function useNexusNotifications() {
  const ctx = useContext(NexusNotificationsContext)
  if (!ctx) {
    throw new Error("useNexusNotifications must be used within NexusNotificationsProvider")
  }
  return ctx
}
