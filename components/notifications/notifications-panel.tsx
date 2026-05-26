"use client"

import { useEffect, useMemo, useState } from "react"
import { Bell, X } from "lucide-react"
import { createPortal } from "react-dom"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { filterOperationalAlerts } from "@/lib/notifications/inbox-routing"
import { detectLowEndDevice } from "@/lib/mobile/detect-low-end-device"
import {
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
 * Lightweight notifications panel — solid surfaces on low-end Android (no backdrop blur / heavy shadows).
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
    <div
      className={cn(
        "nexus-notification-portal fixed inset-0 z-[200] md:hidden",
        lowEnd && "nexus-notification-portal--low-gpu",
      )}
      role="presentation"
    >
      <button
        type="button"
        className={cn(
          "absolute inset-0 touch-manipulation",
          lowEnd ? "bg-background/95" : "bg-black/55",
        )}
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-panel-title"
        className={cn(
          "notifications-panel absolute inset-x-0 bottom-0 flex max-h-[min(92dvh,820px)] flex-col rounded-t-2xl border border-border bg-card",
          lowEnd && "low-gpu-mode shadow-none",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
                <Bell className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 id="notifications-panel-title" className="text-base font-semibold text-foreground">
                  {t("notifications.center.title")}
                </h2>
                <p className="text-xs text-muted-foreground">{t("notifications.inbox.panelSubtitleAlerts")}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => markAllRead()}
                className="text-xs font-medium text-primary touch-manipulation"
              >
                {t("notifications.center.markAllRead")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="nexus-touch-press rounded-lg p-2 text-muted-foreground touch-manipulation hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="notification-list min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-3 py-2">
          <NotificationInboxFilters
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPending={false}
            t={t}
            className="mb-3"
          />
          {filtered.length === 0 ? (
            <NotificationInboxEmpty
              message={t("notifications.center.empty")}
              hint={search.trim() ? t("notifications.inbox.searchEmptyHint") : undefined}
            />
          ) : (
            <ul className="space-y-2 pb-2">
              {filtered.map((n) => {
                const p = presentedMap.get(n.id)!
                return (
                  <li key={n.id} className="[content-visibility:auto]">
                    <div
                      className={cn(
                        "notification-card rounded-2xl border border-border/80 bg-card p-3 active:scale-[0.985] transition-transform",
                        lowEnd && "border-white/10 bg-[#141C34] shadow-none backdrop-blur-none",
                      )}
                    >
                      <NotificationInboxRow
                        item={n}
                        presented={p}
                        className="rounded-xl border-0 bg-transparent p-0 active:bg-transparent"
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
    </div>,
    document.body,
  )
}
