"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useNexusNotifications, type NexusNotificationItem } from "@/contexts/NexusNotificationsContext"
import { supabase } from "@/lib/supabaseClient"
import { isServerNotificationId } from "@/lib/nexus-notifications-merge"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import type { NexusNotificationType } from "@/lib/nexus-notification-models"
import {
  INBOX_CARD,
  NotificationDetailSheet,
  NotificationInboxEmpty,
  NotificationInboxRow,
} from "@/components/dashboard/notification-inbox-ui"
import { presentNotification } from "@/lib/notifications/notification-inbox-presenter"
import { usePresentedNotifications } from "@/hooks/use-presented-notifications"
import { mapCustomerNotification } from "@/lib/notifications/notification-mapper"
import { sanitizeCustomerNotificationText } from "@/lib/notifications/customer-notification-language"

const KNOWN: NexusNotificationType[] = [
  "price",
  "trade",
  "security",
  "promo",
  "system",
  "analysis",
  "financial",
]

function mapRow(
  r: {
    id: string
    notification_type: string | null
    title: string
    body: string
    nav: unknown
    read_at: string | null
    created_at: string
    metadata?: unknown
  },
  viewer?: {
    fundingCountryCode?: string | null
    preferredCurrency?: string | null
    locale?: string
  },
): NexusNotificationItem {
  const raw = (r.notification_type ?? "system").toLowerCase()
  const notifType: NexusNotificationType = KNOWN.includes(raw as NexusNotificationType)
    ? (raw as NexusNotificationType)
    : "system"
  const nav =
    r.nav && typeof r.nav === "object" && r.nav !== null && "kind" in (r.nav as object)
      ? (r.nav as NexusNotificationNav)
      : ({ kind: "notifications" } as NexusNotificationNav)
  const fallback = "Your account was updated."
  const mapped = mapCustomerNotification({
    notificationType: r.notification_type,
    title: r.title,
    body: r.body,
    metadata: r.metadata,
    viewer,
  })
  return {
    id: r.id,
    type: notifType,
    title: sanitizeCustomerNotificationText(mapped?.title ?? r.title, fallback),
    message: sanitizeCustomerNotificationText(mapped?.body ?? r.body, fallback),
    timestamp: r.created_at,
    read: !!r.read_at,
    archived: true,
    nav,
  }
}

interface ArchivedNotificationsSheetProps {
  isOpen: boolean
  onClose: () => void
}

export function ArchivedNotificationsSheet({ isOpen, onClose }: ArchivedNotificationsSheetProps) {
  const { t, currency, country, locale } = useUserPreferences()
  const { history, deleteFromHistory, unarchiveFromHistory } = useNexusNotifications()
  const [serverArchived, setServerArchived] = useState<NexusNotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<NexusNotificationItem | null>(null)

  useBodyScrollLock(isOpen)

  const pullServer = useCallback(async () => {
    setLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setServerArchived([])
        return
      }
      const res = await fetch("/api/user/account-notifications?folder=archived&limit=200", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!res.ok) {
        setServerArchived([])
        return
      }
      const out = (await res.json().catch(() => ({}))) as {
        items?: Array<{
          id: string
          notification_type: string | null
          title: string
          body: string
          nav: unknown
          read_at: string | null
          created_at: string
        }>
      }
      const viewer = {
        fundingCountryCode: country ?? null,
        preferredCurrency: currency,
        locale,
      }
      setServerArchived(
        (out.items ?? []).map((row) =>
          mapRow(
            {
              ...row,
              metadata: (row as { metadata?: unknown }).metadata,
            },
            viewer,
          ),
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [country, currency, locale])

  useEffect(() => {
    if (!isOpen) return
    void pullServer()
  }, [isOpen, pullServer])

  const merged = useMemo(
    () =>
      [...serverArchived, ...history].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [serverArchived, history]
  )

  const presentedMap = usePresentedNotifications(merged, t)

  const patch = async (body: Record<string, unknown>) => {
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
  }

  const handleUnarchive = async (n: NexusNotificationItem) => {
    if (isServerNotificationId(n.id)) {
      const ok = await patch({ id: n.id, action: "unarchive" })
      if (ok) setServerArchived((prev) => prev.filter((x) => x.id !== n.id))
      return
    }
    unarchiveFromHistory(n.id)
  }

  const handleDelete = async (n: NexusNotificationItem) => {
    if (isServerNotificationId(n.id)) {
      const ok = await patch({ id: n.id, action: "hide" })
      if (ok) setServerArchived((prev) => prev.filter((x) => x.id !== n.id))
      return
    }
    deleteFromHistory(n.id)
  }

  const selectedPresented = selected
    ? presentNotification(selected, t, {
        fundingCountryCode: country ?? null,
        displayCurrency: currency,
        locale,
      })
    : null

  if (!isOpen || typeof document === "undefined") return null

  return createPortal(
    <div
      className="nexus-overlay-scrim nexus-notification-portal fixed inset-0 z-[130] flex justify-end bg-foreground/20 backdrop-blur-[2px] dark:bg-black/45 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <Card
        className="flex h-full w-full max-w-md flex-col rounded-none border-l border-border/90 bg-card shadow-xl sm:h-[min(92dvh,640px)] sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">{t("header.archivedTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("header.archivedSubtitle")}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="nexus-scroll-isolated min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : merged.length === 0 ? (
            <NotificationInboxEmpty
              message={t("header.archivedEmpty")}
              hint={t("header.archivedEmptyHint")}
              className="py-16"
            />
          ) : (
            <ul className={`${INBOX_CARD} mx-2 my-2 divide-y divide-border/50 overflow-hidden border-0`}>
              {merged.map((n) => {
                const p = presentedMap.get(n.id)!
                return (
                  <li key={n.id}>
                    <NotificationInboxRow item={n} presented={p} onOpen={() => setSelected(n)} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Card>

      {selected && selectedPresented ? (
        <NotificationDetailSheet
          item={selected}
          presented={selectedPresented}
          t={t}
          onClose={() => setSelected(null)}
          showArchive
          archiveLabel={t("notifications.center.unarchive")}
          onArchive={() => {
            void handleUnarchive(selected)
            setSelected(null)
          }}
          onDelete={() => {
            void handleDelete(selected)
            setSelected(null)
          }}
        />
      ) : null}
    </div>,
    document.body
  )
}
