"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bell } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useNexusNotifications, type NexusNotificationItem } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
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
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import { storeUserInitiatedPendingNav } from "@/lib/dashboard-navigation-policy"
import { Button } from "@/components/ui/button"

export default function NotificationsHistoryPage() {
  const router = useRouter()
  const { t } = useUserPreferences()
  const { user, isLoading: authLoading, isGuestSession } = useAuth()
  const { inbox, history, markRead, deleteFromHistory, clearHistory } = useNexusNotifications()

  const [filter, setFilter] = useState<InboxFilter>("all")
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [selected, setSelected] = useState<NexusNotificationItem | null>(null)
  const [listLimit, setListLimit] = useState(80)

  useEffect(() => {
    if (isGuestSession) return
    if (!authLoading && !user) {
      router.replace("/auth/login")
    }
  }, [authLoading, user, isGuestSession, router])

  const merged = useMemo(() => {
    const map = new Map<string, NexusNotificationItem>()
    for (const n of [...inbox, ...history]) map.set(n.id, n)
    return [...map.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [inbox, history])

  const presentedMap = usePresentedNotifications(merged, t)

  const filtered = useMemo(
    () => filterInboxNotifications(merged, filter, deferredSearch, presentedMap),
    [merged, filter, deferredSearch, presentedMap]
  )

  const visible = useMemo(() => filtered.slice(0, listLimit), [filtered, listLimit])

  const openItem = useCallback(
    (n: NexusNotificationItem) => {
      setSelected(n)
      markRead(n.id)
    },
    [markRead]
  )

  const openLinked = useCallback(
    (n: NexusNotificationItem) => {
      if (!n.nav || n.nav.kind === "detail") return
      storeUserInitiatedPendingNav(n.nav as NexusNotificationNav)
      router.push("/dashboard")
    },
    [router]
  )

  const closeDetail = useCallback(() => setSelected(null), [])
  const selectedPresented = selected ? presentNotification(selected, t) : null

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-8">
      <div className="mx-auto w-full max-w-lg px-4 py-6 md:max-w-2xl">
        <Link
          href="/dashboard"
          className="mb-5 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          {t("notifications.history.back")}
        </Link>

        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
              <Bell className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("notifications.history.title")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("notifications.history.subtitle")} · {merged.length}
              </p>
            </div>
          </div>
          {merged.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 shrink-0 text-xs"
              onClick={clearHistory}
            >
              {t("notifications.history.clear")}
            </Button>
          ) : null}
        </header>

        <NotificationInboxFilters
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          searchPending={search !== deferredSearch}
          t={t}
          className="mb-4"
        />

        <section className={`${INBOX_CARD} overflow-hidden`}>
          {visible.length === 0 ? (
            <NotificationInboxEmpty
              message={
                deferredSearch.trim() || filter !== "all"
                  ? t("notifications.inbox.searchEmpty")
                  : t("notifications.center.empty")
              }
              hint={deferredSearch.trim() ? t("notifications.inbox.searchEmptyHint") : undefined}
            />
          ) : (
            <ul className="divide-y divide-border/50">
              {visible.map((n) => {
                const p = presentedMap.get(n.id)!
                return (
                  <li key={n.id} className="[content-visibility:auto] [contain-intrinsic-size:80px_1px]">
                    <NotificationInboxRow item={n} presented={p} onOpen={() => openItem(n)} />
                  </li>
                )
              })}
            </ul>
          )}
          {filtered.length > visible.length ? (
            <div className="border-t border-border/50 p-3 text-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => setListLimit((x) => x + 80)}
              >
                {t("notifications.inbox.loadMore").replace("{{n}}", String(filtered.length - visible.length))}
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      {selected && selectedPresented ? (
        <NotificationDetailSheet
          item={selected}
          presented={selectedPresented}
          t={t}
          onClose={closeDetail}
          showArchive={false}
          onArchive={() => {}}
          onDelete={() => {
            deleteFromHistory(selected.id)
            closeDetail()
          }}
          onOpenLinked={
            selected.nav && selected.nav.kind !== "detail" ? () => openLinked(selected) : undefined
          }
        />
      ) : null}
    </div>
  )
}
