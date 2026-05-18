"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import { Bell, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useNexusNotifications, type NexusNotificationItem } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { presentNotification } from "@/lib/notifications/notification-inbox-presenter"
import { filterInboxNotifications, usePresentedNotifications } from "@/hooks/use-presented-notifications"
import { supabase } from "@/lib/supabaseClient"
import {
  INBOX_CARD,
  NotificationDetailSheet,
  NotificationInboxEmpty,
  NotificationInboxFilters,
  NotificationInboxRow,
  type InboxFilter,
} from "@/components/dashboard/notification-inbox-ui"

type CryptoDepositRow = {
  id: string
  amount_usd: number
  tx_hash: string
  status: string
  on_chain_amount_usdt: number | null
  confirmations: number | null
  min_confirmations: number | null
  failure_reason: string | null
  created_at: string
  credited_at: string | null
  total_credited_usd: number | null
}

function depositStatusLabel(status: string, t: (key: string) => string): string {
  const key = `notifications.center.depositStatus.${status}`
  const mapped = t(key)
  if (mapped !== key) return mapped
  return t("notifications.center.depositStatus.default")
}

function depositIsVerifying(status: string): boolean {
  return ["pending", "verifying", "awaiting_confirmations"].includes(status)
}

function depositIsCrediting(status: string): boolean {
  return status === "verified"
}

function isActiveDepositStatus(status: string): boolean {
  return !["credited", "rejected", "failed"].includes(status)
}

export function NotificationCenterScreen() {
  const { t } = useUserPreferences()
  const { inbox, accountInboxReady, markRead, markAllRead, deleteFromInbox, archiveFromInbox, runAppNavigation } =
    useNexusNotifications()
  const [selected, setSelected] = useState<NexusNotificationItem | null>(null)
  const [filter, setFilter] = useState<InboxFilter>("all")
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [cryptoDeposits, setCryptoDeposits] = useState<CryptoDepositRow[]>([])
  const [depositsLoading, setDepositsLoading] = useState(true)

  const loadDeposits = useCallback(async (runVerify = false) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setCryptoDeposits([])
        return
      }
      const qs = runVerify ? "?refresh=1" : ""
      const res = await fetch(`/api/user/crypto-deposit${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!res.ok) return
      const out = (await res.json().catch(() => ({}))) as { deposits?: CryptoDepositRow[] }
      setCryptoDeposits(out.deposits ?? [])
    } catch {
      /* ignore */
    } finally {
      setDepositsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDeposits(true)
  }, [loadDeposits])

  const activeDeposits = useMemo(
    () => cryptoDeposits.filter((d) => isActiveDepositStatus(String(d.status ?? ""))),
    [cryptoDeposits]
  )

  useEffect(() => {
    if (depositsLoading || activeDeposits.length === 0) return
    const id = window.setInterval(() => void loadDeposits(false), 60_000)
    return () => window.clearInterval(id)
  }, [loadDeposits, depositsLoading, activeDeposits.length])

  const sorted = useMemo(
    () => [...inbox].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [inbox]
  )

  const presentedMap = usePresentedNotifications(sorted, t)

  const filtered = useMemo(
    () => filterInboxNotifications(sorted, filter, deferredSearch, presentedMap),
    [sorted, filter, deferredSearch, presentedMap]
  )

  const openItem = useCallback(
    (n: NexusNotificationItem) => {
      setSelected(n)
      markRead(n.id)
    },
    [markRead]
  )

  const closeDetail = useCallback(() => setSelected(null), [])
  const selectedPresented = selected ? presentNotification(selected, t) : null

  return (
    <div className="mx-auto w-full max-w-lg pb-24 pt-4 md:max-w-2xl md:pb-8">
      <header className="mb-4 flex items-start justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
            <Bell className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("nav.notifications")}</h1>
            <p className="text-sm text-muted-foreground">{t("notifications.center.subtitle")}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 shrink-0 gap-1 text-xs font-medium"
          onClick={() => markAllRead()}
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          {t("notifications.center.markAllRead")}
        </Button>
      </header>

      <NotificationInboxFilters
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        searchPending={search !== deferredSearch}
        t={t}
        className="mb-4 px-1"
      />

      {!depositsLoading && activeDeposits.length > 0 ? (
        <section className={`${INBOX_CARD} mb-4 overflow-hidden`}>
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("notifications.inbox.category.funding")}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{t("notifications.center.depositsTitle")}</p>
          </div>
          <ul className="divide-y divide-border/50">
            {activeDeposits.map((d) => {
              const status = String(d.status ?? "")
              const received = Number(d.on_chain_amount_usdt ?? 0)
              const bonus = received > 0 ? Math.round(received * 0.065 * 100) / 100 : 0
              const total = Number(d.total_credited_usd ?? 0)
              const expected =
                total > 0 ? total : received > 0 ? Math.round((received + bonus) * 100) / 100 : 0
              const verifying = depositIsVerifying(status)
              const crediting = depositIsCrediting(status)
              const needsHelp = status === "failed" || status === "rejected"
              return (
                <li key={d.id} className="px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">{depositStatusLabel(status, t)}</p>
                  {verifying ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("notifications.center.depositVerifying")}</p>
                  ) : null}
                  {crediting ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("notifications.center.depositCreditingDelay")}
                    </p>
                  ) : null}
                  {expected > 0 && (verifying || crediting) ? (
                    <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {t("notifications.center.depositAmountComing").replace("{{amount}}", expected.toFixed(2))}
                    </p>
                  ) : null}
                  {needsHelp ? (
                    <p className="mt-1 text-xs text-destructive">{t("notifications.center.depositFailed")}</p>
                  ) : null}
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground/70">
                    Ref {d.tx_hash.slice(0, 8)}…{d.tx_hash.slice(-6)}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className={`${INBOX_CARD} overflow-hidden`}>
        {!accountInboxReady ? (
          <div className="divide-y divide-border/40" aria-busy="true" aria-label={t("notifications.center.subtitle")}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2.5 px-3 py-3 animate-pulse">
                <div className="h-9 w-9 shrink-0 rounded-lg bg-muted/40" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-2.5 w-1/3 rounded bg-muted/40" />
                  <div className="h-3 w-4/5 rounded bg-muted/50" />
                  <div className="h-2.5 w-full rounded bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <NotificationInboxEmpty
            message={
              activeDeposits.length > 0
                ? t("notifications.center.depositsEmptyInbox")
                : deferredSearch.trim() || filter !== "all"
                  ? t("notifications.inbox.searchEmpty")
                  : t("notifications.center.empty")
            }
            hint={deferredSearch.trim() ? t("notifications.inbox.searchEmptyHint") : undefined}
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {filtered.map((n) => {
              const p = presentedMap.get(n.id)!
              return (
                <li key={n.id}>
                  <NotificationInboxRow item={n} presented={p} onOpen={() => openItem(n)} />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {selected && selectedPresented ? (
        <NotificationDetailSheet
          item={selected}
          presented={selectedPresented}
          t={t}
          onClose={closeDetail}
          onArchive={() => {
            archiveFromInbox(selected.id)
            closeDetail()
          }}
          onDelete={() => {
            deleteFromInbox(selected.id)
            closeDetail()
          }}
          onOpenLinked={
            selected.nav && selected.nav.kind !== "detail"
              ? () => {
                  runAppNavigation(selected.nav!)
                  closeDetail()
                }
              : undefined
          }
        />
      ) : null}
    </div>
  )
}
