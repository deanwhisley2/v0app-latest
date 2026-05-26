"use client"

import { useMemo, useState } from "react"
import { Bell, X } from "lucide-react"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { filterOperationalAlerts } from "@/lib/notifications/inbox-routing"
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
import { MobileOverlaySheet } from "@/components/mobile/mobile-overlay-sheet"

type Props = {
  isOpen: boolean
  onClose: () => void
  onNavigate?: (nav: NexusNotificationItem["nav"]) => void
}

/** Header bell — operational alerts only (no saved-for-later archive). */
export function OperationalAlertsSheet({ isOpen, onClose, onNavigate }: Props) {
  const { t, currency, country, locale } = useUserPreferences()
  const { inbox, markRead } = useNexusNotifications()
  const [filter, setFilter] = useState<InboxFilter>("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<NexusNotificationItem | null>(null)

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

  return (
    <MobileOverlaySheet open={isOpen} onClose={onClose}>
      <div className="flex max-h-[min(88dvh,720px)] flex-col bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
              <Bell className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">{t("notifications.center.title")}</h2>
              <p className="text-xs text-muted-foreground">{t("notifications.center.subtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="nexus-touch-press rounded-lg p-2 text-muted-foreground touch-manipulation hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 nexus-chat-scroll">
          <NotificationInboxFilters
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPending={false}
            t={t}
            className="mb-3"
          />
          <section className={`${INBOX_CARD} overflow-hidden`}>
            {filtered.length === 0 ? (
              <NotificationInboxEmpty
                message={t("notifications.center.empty")}
                hint={search.trim() ? t("notifications.inbox.searchEmptyHint") : undefined}
              />
            ) : (
              <ul className="divide-y divide-border/50">
                {filtered.map((n) => {
                  const p = presentedMap.get(n.id)!
                  return (
                    <li key={n.id} className="[content-visibility:auto]">
                      <NotificationInboxRow
                        item={n}
                        presented={p}
                        onOpen={() => {
                          setSelected(n)
                          markRead(n.id)
                        }}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
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
    </MobileOverlaySheet>
  )
}
