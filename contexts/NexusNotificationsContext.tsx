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
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import type {
  NexusNotificationItem,
  NexusNotificationType,
} from "@/lib/nexus-notification-models"
import { broadcastOperationalBump } from "@/lib/nexus-operational-sync-broadcast"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import type { OperationalPreferencesV1 } from "@/lib/operational-preferences-types"
import { sanitizeCustomerNotificationText } from "@/lib/notifications/customer-notification-language"
import { supabase } from "@/lib/supabaseClient"
import {
  isServerNotificationId,
  mergeServerAccountWithLocals,
  sameInboxSignature,
  upsertServerNotificationRows,
} from "@/lib/nexus-notifications-merge"
import {
  clearLegacyGlobalNotificationStorage,
  loadPersistedNotifications,
  savePersistedNotifications,
} from "@/lib/nexus-notifications-storage"

export type {
  NexusNotificationType,
  AnalysisNotificationPayload,
  NexusNotificationItem,
} from "@/lib/nexus-notification-models"

export type UiChromePreferences = OperationalPreferencesV1["uiChrome"]

/** Placeholder inbox rows shown only for guest / demo sessions — not real account activity. */
export function isDemoNotificationId(id: string): boolean {
  return id.startsWith("seed-")
}

function withoutDemoNotifications(items: NexusNotificationItem[]): NexusNotificationItem[] {
  return items.filter((n) => !isDemoNotificationId(n.id))
}

const KNOWN_NOTIF_TYPES: NexusNotificationType[] = [
  "price",
  "trade",
  "security",
  "promo",
  "system",
  "analysis",
  "financial",
]

function mapServerAccountRow(r: {
  id: string
  notification_type: string | null
  title: string
  body: string
  nav: unknown
  read_at: string | null
  created_at: string
  user_archived_at?: string | null
  metadata?: unknown
}): NexusNotificationItem {
  const raw = (r.notification_type ?? "system").toLowerCase()
  let type: NexusNotificationType = KNOWN_NOTIF_TYPES.includes(raw as NexusNotificationType)
    ? (raw as NexusNotificationType)
    : "system"
  if (
    raw.startsWith("crypto_deposit") ||
    raw.includes("withdrawal") ||
    raw.includes("funding") ||
    raw.includes("retailer_fund")
  ) {
    type = "financial"
  }
  const nav =
    r.nav && typeof r.nav === "object" && r.nav !== null && "kind" in (r.nav as object)
      ? (r.nav as NexusNotificationNav)
      : ({ kind: "notifications" } satisfies NexusNotificationNav)
  const meta =
    r.metadata && typeof r.metadata === "object" && r.metadata !== null
      ? (r.metadata as Record<string, unknown>)
      : null
  const fallbackDetail = "See your account balance for the latest status."
  const rawDetail = typeof meta?.friendly_detail === "string" ? meta.friendly_detail : undefined
  const detailText = rawDetail
    ? sanitizeCustomerNotificationText(rawDetail, fallbackDetail)
    : undefined
  const fallbackMsg = "Your account was updated."
  return {
    id: r.id,
    type,
    title: sanitizeCustomerNotificationText(r.title, fallbackMsg),
    message: sanitizeCustomerNotificationText(r.body, fallbackMsg),
    timestamp: r.created_at,
    read: !!r.read_at,
    archived: !!r.user_archived_at,
    detailText,
    nav,
  }
}

function iso(d: Date) {
  return d.toISOString()
}

function seedInbox(): NexusNotificationItem[] {
  const types: NexusNotificationType[] = ["price", "trade", "security", "promo", "system"]
  const symbols = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT", "MATIC"]
  const count = 8
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
        title = `${sym} price update`
        message = `${sym} moved a lot recently — tap Trade if you want to look closer.`
        nav = { kind: "trade", symbol: sym }
        break
      case "trade":
        title = i % 2 === 0 ? "Order filled" : "Order partly filled"
        message = `Your ${i % 2 === 0 ? "buy" : "sell"} on ${sym}. Open Orders for the full picture.`
        nav = { kind: "orders" }
        break
      case "security":
        title = "Quick security check"
        message = `Account activity #${i + 1} logged. If unrecognized, open Security in Settings.`
        nav = { kind: "settings", view: "security" }
        break
      case "promo":
        title = "Rewards & offers"
        message = `Offer ${i + 1} — details pending.`
        nav = { kind: "notifications" }
        break
      case "system":
      default:
        title = "From the Nexus team"
        message = `System update ${i + 1}: maintenance. Action required only if notified.`
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
  return []
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
  unarchiveFromHistory: (id: string) => void
}

const NexusNotificationsContext = createContext<NexusNotificationsContextValue | null>(null)

export function NexusNotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isGuestSession } = useAuth()
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
  const persistLocalTimerRef = useRef<number | null>(null)
  /** When true, account rows load from `/api/user/account-notifications` and skip operational-preferences inbox mirror. */
  const [accountNotifFeedOn, setAccountNotifFeedOn] = useState(false)
  const notificationsUserKeyRef = useRef<string | null>(null)

  useEffect(() => {
    clearLegacyGlobalNotificationStorage()
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const key = isGuestSession ? "guest" : (user?.id ?? "anonymous")
    if (notificationsUserKeyRef.current === key) return
    notificationsUserKeyRef.current = key

    clearLegacyGlobalNotificationStorage()
    setAccountNotifFeedOn(false)
    serverNotifSerializedRef.current = ""
    lastPostedJsonRef.current = ""
    seedCapturedRef.current = false
    hadLocalPersistedRef.current = false

    if (isGuestSession) {
      setInbox(seedInbox())
      setHistory(seedHistory())
      return
    }

    const persisted = loadPersistedNotifications(user?.id ?? null, false)
    hadLocalPersistedRef.current = !!persisted
    if (persisted) {
      setInbox(withoutDemoNotifications(persisted.inbox))
      setHistory(withoutDemoNotifications(persisted.history))
    } else {
      setInbox([])
      setHistory([])
    }
  }, [hydrated, user?.id, isGuestSession])

  useEffect(() => {
    if (!hydrated) return
    if (persistLocalTimerRef.current) window.clearTimeout(persistLocalTimerRef.current)
    persistLocalTimerRef.current = window.setTimeout(() => {
      savePersistedNotifications(user?.id ?? null, isGuestSession, inbox, history)
      persistLocalTimerRef.current = null
    }, 1400)
    return () => {
      if (persistLocalTimerRef.current) window.clearTimeout(persistLocalTimerRef.current)
    }
  }, [inbox, history, hydrated, user?.id, isGuestSession])

  useEffect(() => {
    if (!hydrated) return
    if (seedCapturedRef.current) return
    seedCapturedRef.current = true
    initialSeedSigRef.current = JSON.stringify({ inbox, history })
  }, [hydrated, inbox, history])

  useEffect(() => {
    if (!hydrated) return
    if (!user?.id || isGuestSession || isDevLocalOnly()) return
    if (accountNotifFeedOn) return
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
  }, [hydrated, inbox, history, user?.id, isGuestSession, accountNotifFeedOn])

  useEffect(() => {
    if (!hydrated) return
    if (!user?.id || isGuestSession || isDevLocalOnly()) return
    let cancelled = false

    const pullAccountNotifications = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token || cancelled) return
        const res = await fetch("/api/user/account-notifications?folder=inbox&limit=250", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        if (!res.ok || cancelled) return
        const out = (await res.json().catch(() => ({}))) as {
          items?: Array<{
            id: string
            notification_type: string | null
            title: string
            body: string
            nav: unknown
            read_at: string | null
            created_at: string
            user_archived_at?: string | null
            metadata?: unknown
          }>
        }
        const rows = out.items ?? []
        if (cancelled) return
        setAccountNotifFeedOn(true)
        const serverItems = rows.map(mapServerAccountRow)
        setInbox((prev) => {
          const locals = prev.filter((p) => !isServerNotificationId(p.id) && !p.id.startsWith("fin-"))
          const merged = withoutDemoNotifications(
            serverItems.length === 0
              ? locals
              : mergeServerAccountWithLocals(locals, serverItems),
          )
          if (sameInboxSignature(prev, merged)) return prev
          return merged
        })
      } catch {
        /* ignore */
      }
    }

    void pullAccountNotifications()
    const id = window.setInterval(pullAccountNotifications, 90_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [hydrated, user?.id, isGuestSession])

  useEffect(() => {
    if (!hydrated) return
    if (!user?.id || isGuestSession || isDevLocalOnly()) return
    const uid = user.id

    const mapRow = (raw: Record<string, unknown>): NexusNotificationItem | null => {
      const id = typeof raw.id === "string" ? raw.id : null
      const title = typeof raw.title === "string" ? raw.title : null
      const body = typeof raw.body === "string" ? raw.body : null
      const created_at = typeof raw.created_at === "string" ? raw.created_at : null
      if (!id || !title || !body || !created_at) return null
      if (raw.user_deleted_at) return null
      return mapServerAccountRow({
        id,
        notification_type: typeof raw.notification_type === "string" ? raw.notification_type : null,
        title,
        body,
        nav: raw.nav,
        read_at: typeof raw.read_at === "string" ? raw.read_at : null,
        created_at,
        user_archived_at:
          typeof raw.user_archived_at === "string"
            ? raw.user_archived_at
            : raw.user_archived_at === null
              ? null
              : undefined,
        metadata: raw.metadata,
      })
    }

    const channel = supabase
      .channel(`acct-notif:${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_account_notifications",
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          setAccountNotifFeedOn(true)
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string } | undefined)?.id
            if (oldId) setInbox((prev) => prev.filter((n) => n.id !== oldId))
            return
          }
          const raw = (payload.new ?? {}) as Record<string, unknown>
          if (raw.user_deleted_at) {
            const hid = typeof raw.id === "string" ? raw.id : null
            if (hid) setInbox((prev) => prev.filter((n) => n.id !== hid))
            return
          }
          const item = mapRow(raw)
          if (!item) return
          if (item.archived) {
            setInbox((prev) => prev.filter((n) => n.id !== item.id))
            return
          }
          setInbox((prev) => {
            const merged = upsertServerNotificationRows(prev, [item])
            if (sameInboxSignature(prev, merged)) return prev
            return merged
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [hydrated, user?.id, isGuestSession])

  const patchAccountNotification = useCallback(async (body: Record<string, unknown>) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return false
      const res = await fetch("/api/user/account-notifications", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const registerAppNavigator = useCallback((fn: NavigatorFn | null) => {
    navRef.current = fn
  }, [])

  const runAppNavigation = useCallback((nav: NexusNotificationNav) => {
    navRef.current?.(nav)
  }, [])

  const unreadCount = useMemo(() => inbox.filter((n) => !n.read).length, [inbox])

  const markRead = useCallback(
    (id: string) => {
      if (isServerNotificationId(id)) {
        void patchAccountNotification({ id, action: "mark_read" }).then((ok) => {
          if (ok) setInbox((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
        })
        return
      }
      setInbox((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    },
    [patchAccountNotification]
  )

  const markAllRead = useCallback(() => {
    void patchAccountNotification({ action: "mark_all_read" }).then(() => {
      setInbox((prev) => prev.map((n) => ({ ...n, read: true })))
    })
  }, [patchAccountNotification])

  const deleteFromInbox = useCallback(
    (id: string) => {
      if (isServerNotificationId(id)) {
        void patchAccountNotification({ id, action: "hide" }).then((ok) => {
          if (ok) setInbox((prev) => prev.filter((n) => n.id !== id))
        })
        return
      }
      setInbox((prev) => prev.filter((n) => n.id !== id))
    },
    [patchAccountNotification]
  )

  const archiveFromInbox = useCallback(
    (id: string) => {
      if (isServerNotificationId(id)) {
        void patchAccountNotification({ id, action: "archive" }).then((ok) => {
          if (ok) setInbox((prev) => prev.filter((n) => n.id !== id))
        })
        return
      }
      setInbox((prev) => {
        const hit = prev.find((n) => n.id === id)
        if (!hit) return prev
        const archived: NexusNotificationItem = { ...hit, read: true, archived: true }
        setHistory((h) => [archived, ...h])
        return prev.filter((n) => n.id !== id)
      })
    },
    [patchAccountNotification]
  )

  const clearInbox = useCallback(() => {
    void patchAccountNotification({ action: "clear_all" }).then((ok) => {
      if (!ok) return
      setInbox((prev) => {
        const locals = prev.filter((n) => !isServerNotificationId(n.id))
        setHistory((h) => [...locals.map((n) => ({ ...n, read: true })), ...h])
        return []
      })
    })
  }, [patchAccountNotification])

  const addNotification = useCallback(
    (item: Omit<NexusNotificationItem, "id" | "timestamp" | "read"> & { id?: string; timestamp?: string }) => {
      const createdId =
        item.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
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

  const unarchiveFromHistory = useCallback((id: string) => {
    setHistory((prev) => {
      const hit = prev.find((n) => n.id === id)
      if (!hit) return prev
      const next = prev.filter((n) => n.id !== id)
      const back: NexusNotificationItem = { ...hit, read: false, archived: false }
      setInbox((inb) => [back, ...inb])
      return next
    })
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
      unarchiveFromHistory,
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
      unarchiveFromHistory,
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
