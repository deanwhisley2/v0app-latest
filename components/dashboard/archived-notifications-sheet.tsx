"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { ArchiveRestore, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useNexusNotifications, type NexusNotificationItem } from "@/contexts/NexusNotificationsContext"
import { supabase } from "@/lib/supabaseClient"
import { isServerNotificationId } from "@/lib/nexus-notifications-merge"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import type { NexusNotificationType } from "@/lib/nexus-notification-models"

const KNOWN: NexusNotificationType[] = [
  "price",
  "trade",
  "security",
  "promo",
  "system",
  "analysis",
  "financial",
]

function mapRow(r: {
  id: string
  notification_type: string | null
  title: string
  body: string
  nav: unknown
  read_at: string | null
  created_at: string
}): NexusNotificationItem {
  const raw = (r.notification_type ?? "system").toLowerCase()
  const notifType: NexusNotificationType = KNOWN.includes(raw as NexusNotificationType)
    ? (raw as NexusNotificationType)
    : "system"
  const nav =
    r.nav && typeof r.nav === "object" && r.nav !== null && "kind" in (r.nav as object)
      ? (r.nav as NexusNotificationNav)
      : ({ kind: "notifications" } as NexusNotificationNav)
  return {
    id: r.id,
    type: notifType,
    title: r.title,
    message: r.body,
    timestamp: r.created_at,
    read: !!r.read_at,
    archived: true,
    nav,
  }
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

interface ArchivedNotificationsSheetProps {
  isOpen: boolean
  onClose: () => void
}

export function ArchivedNotificationsSheet({ isOpen, onClose }: ArchivedNotificationsSheetProps) {
  const { t } = useUserPreferences()
  const { history, deleteFromHistory, unarchiveFromHistory } = useNexusNotifications()
  const [serverArchived, setServerArchived] = useState<NexusNotificationItem[]>([])
  const [loading, setLoading] = useState(false)

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
      setServerArchived((out.items ?? []).map(mapRow))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    void pullServer()
  }, [isOpen, pullServer])

  const merged = [...serverArchived, ...history].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )

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

  if (!isOpen || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[130] flex justify-end bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true">
      <Card className="flex h-full w-full max-w-md flex-col rounded-none border-l border-border bg-card shadow-2xl sm:h-[min(92dvh,640px)] sm:rounded-xl sm:border">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">{t("header.archivedTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("header.archivedSubtitle")}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : merged.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("header.archivedEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {merged.map((n) => (
                <li key={n.id} className="px-4 py-3">
                  <p className="font-medium text-foreground">{n.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{formatWhen(n.timestamp)}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => void handleUnarchive(n)}
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      {t("notifications.center.unarchive")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                      onClick={() => void handleDelete(n)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("notifications.center.delete")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>,
    document.body,
  )
}
