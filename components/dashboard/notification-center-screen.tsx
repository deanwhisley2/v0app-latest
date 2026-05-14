"use client"

import { useCallback, useMemo, useState } from "react"
import { Archive, Bell, CheckCheck, ChevronLeft, Trash2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useNexusNotifications, type NexusNotificationItem } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { cn } from "@/lib/utils"

function formatWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function previewText(message: string) {
  const t = message.trim()
  if (t.length <= 100) return t
  return `${t.slice(0, 97)}…`
}

/** Short, plain-language detail when we do not have a dedicated `detailText` from the server. */
function friendlyExplanation(n: NexusNotificationItem, t: (key: string) => string): string {
  const d = n.detailText?.trim()
  if (d) return d
  const m = n.message
  if (/book entry|retail_balance|nexus_main|→|debited|credited/i.test(m)) {
    return t("notifications.center.detailBalancePlain")
  }
  return m
}

export function NotificationCenterScreen() {
  const { t } = useUserPreferences()
  const {
    inbox,
    markRead,
    markAllRead,
    deleteFromInbox,
    archiveFromInbox,
    runAppNavigation,
  } = useNexusNotifications()
  const [selected, setSelected] = useState<NexusNotificationItem | null>(null)

  const sorted = useMemo(
    () => [...inbox].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [inbox],
  )

  const openItem = useCallback((n: NexusNotificationItem) => {
    setSelected(n)
    markRead(n.id)
  }, [markRead])

  const closeDetail = useCallback(() => setSelected(null), [])

  return (
    <div className="mx-auto max-w-lg pb-24 pt-4 md:pb-8">
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">{t("nav.notifications")}</h1>
            <p className="text-xs text-muted-foreground">{t("notifications.center.subtitle")}</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => markAllRead()}>
          <CheckCheck className="h-3.5 w-3.5" />
          {t("notifications.center.markAllRead")}
        </Button>
      </div>

      <Card className="divide-y divide-border overflow-hidden border-border">
        {sorted.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{t("notifications.center.empty")}</div>
        ) : (
          sorted.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openItem(n)}
              className={cn(
                "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/40",
                !n.read && "bg-primary/[0.04]",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-foreground">{n.title}</p>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatWhen(n.timestamp)}</span>
              </div>
              <p className="text-sm text-muted-foreground">{previewText(n.message)}</p>
            </button>
          ))
        )}
      </Card>

      {selected ? (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-black/70 sm:items-center sm:justify-center sm:bg-black/60 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notif-detail-title"
        >
          <Card className="flex max-h-[min(92dvh,560px)] w-full max-w-md flex-col overflow-hidden border-border shadow-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={closeDetail}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 id="notif-detail-title" className="min-w-0 flex-1 truncate text-base font-semibold">
                {selected.title}
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <p className="text-xs text-muted-foreground">{formatWhen(selected.timestamp)}</p>
              <p className="mt-3 text-sm leading-relaxed text-foreground">{friendlyExplanation(selected, t)}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 border-t border-border/60 p-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1"
                onClick={() => {
                  markRead(selected.id)
                  closeDetail()
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t("notifications.center.markRead")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1"
                onClick={() => {
                  archiveFromInbox(selected.id)
                  closeDetail()
                }}
              >
                <Archive className="h-3.5 w-3.5" />
                {t("notifications.center.archive")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-1"
                onClick={() => {
                  deleteFromInbox(selected.id)
                  closeDetail()
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("notifications.center.delete")}
              </Button>
              {selected.nav && selected.nav.kind !== "detail" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    runAppNavigation(selected.nav!)
                    closeDetail()
                  }}
                >
                  {t("notifications.center.openLinked")}
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
