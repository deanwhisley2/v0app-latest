"use client"

import { useEffect, useMemo, useState } from "react"
import { Bell, X } from "lucide-react"
import { createPortal } from "react-dom"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { filterOperationalAlerts } from "@/lib/notifications/inbox-routing"
import { detectLowEndDevice } from "@/lib/mobile/detect-low-end-device"
import {
  INBOX_CARD,
  NotificationDetailSheet,
  NotificationInboxEmpty,
  NotificationInboxFilters,
  NotificationInboxRow,
  type InboxFilter,
} from "@/components/dashboard/notification-inbox-ui"
import { filterInboxNotifications, usePresentedNotifications } from "@/hooks/use-presented-notifications"
import { presentNotification } from "@/lib/notifications/notification-inbox-presenter"
import type { NexusNotificationItem } from "@/lib/nexus-notification-models"
import { cn } from "@/lib/utils"

type Props = {
  isOpen: boolean
  onClose: () => void
  onNavigate?: (nav: NexusNotificationItem["nav"]) => void
}

/**
 * Mobile notifications sheet — scrim and panel are siblings (not one portal root)
 * so low-GPU CSS does not paint the entire viewport as a solid card.
 */
export function NotificationsPanel({ isOpen, onClose, onNavigate }: Props) {
  const { t, currency, country, locale } = useUserPreferences()
  const { inbox, markRead, markAllRead } = useNexusNotifications()
  const [lowEnd, setLowEnd] = useState(false)
  const [filter, setFilter] = useState<InboxFilter>("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<NexusNotificationItem | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setLowEnd(detectLowEndDevice())
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  const alerts = useMemo(() => filterOperationalAlerts(inbox), [inbox])
  const presentedMap = usePresentedNotifications(alerts, t)
  const filtered = useMemo(
    () => filterInboxNotifications(alerts, filter, search, presentedMap),
    [alerts, filter, search, presentedMap],
  )

  const selectedPresented = selected
    ? presentNotification(selected, t, {
        fundingCountryCode: country ?? null,
        displayCurrency: currency,
        locale,
      })
    : null

  if (!mounted || !isOpen || typeof document === "undefined") return null

  return createPortal(
    <>
      <button
        type="button"
        className={cn(
          "nexus-notification-scrim fixed inset-0 z-[200] touch-manipulation md:hidden",
          lowEnd ? "bg-black/50" : "bg-black/55",
        )}
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-panel-title"
        className={cn(
          "nexus-notification-panel fixed inset-x-0 bottom-0 z-[201] flex max-h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-lg md:hidden",
          lowEnd && "shadow-none",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border bg-card">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12">
                <Bell className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 id="notifications-panel-title" className="text-sm font-semibold text-foreground">
                  {t("notifications.center.title")}
                </h2>
                <p className="text-[11px] text-muted-foreground">{t("notifications.inbox.panelSubtitleAlerts")}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => markAllRead()}
                className="rounded-lg px-2 py-1.5 text-[11px] font-medium text-primary touch-manipulation"
              >
                {t("notifications.center.markAllRead")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="nexus-touch-press rounded-lg p-2 text-muted-foreground touch-manipulation"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="border-t border-border/60 px-3 pb-3 pt-2">
            <NotificationInboxFilters
              filter={filter}
              onFilterChange={setFilter}
              search={search}
              onSearchChange={setSearch}
              searchPending={false}
              t={t}
            />
          </div>
        </div>

        <div className="notification-list min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-3 py-2">
          {filtered.length === 0 ? (
            <NotificationInboxEmpty
              message={t("notifications.center.empty")}
              hint={search.trim() ? t("notifications.inbox.searchEmptyHint") : undefined}
            />
          ) : (
            <ul className="space-y-2 pb-3 pt-1">
              {filtered.map((n) => {
                const p = presentedMap.get(n.id)!
                return (
                  <li key={n.id} className="isolate">
                    <div className={cn(INBOX_CARD, "overflow-hidden shadow-none")}>
                      <NotificationInboxRow
                        item={n}
                        presented={p}
                        density="panel"
                        onOpen={() => {
                          setSelected(n)
                          markRead(n.id)
                        }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {selected && selectedPresented ? (
        <NotificationDetailSheet
          item={selected}
          presented={selectedPresented}
          t={t}
          onClose={() => setSelected(null)}
          showArchive={false}
          onArchive={() => {}}
          onDelete={() => setSelected(null)}
          onOpenLinked={
            selected.nav && selected.nav.kind !== "detail"
              ? () => {
                  onNavigate?.(selected.nav)
                  onClose()
                  setSelected(null)
                }
              : undefined
          }
        />
      ) : null}
    </>,
    document.body,
  )
}
