"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Clock, Loader2 } from "lucide-react"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { supabase } from "@/lib/supabaseClient"
import { filterTransactionHistoryFromInbox } from "@/lib/notifications/inbox-routing"
import { presentNotification, formatNotificationTimeAgo } from "@/lib/notifications/notification-inbox-presenter"
import { presentFinancialEventForCustomer } from "@/lib/notifications/financial-event-presenter"
import { INBOX_CARD } from "@/components/dashboard/notification-inbox-ui"

type FinancialEvent = {
  id: string
  event_type: string
  category: string
  gross_amount: number | null
  status: string
  summary: string | null
  created_at: string
}

type CryptoDepositRow = {
  id: string
  amount_usd: number
  status: string
  tx_hash: string
  created_at: string
  credited_at: string | null
}

type WithdrawalRow = {
  id: string
  amount: number
  status: string
  transaction_ref: string
  created_at: string
}

function depositStatusLabel(status: string, t: (key: string) => string): string {
  const key = `notifications.center.depositStatus.${status}`
  const mapped = t(key)
  return mapped !== key ? mapped : status
}

export function HistoryCenterScreen() {
  const { t, currency, country, locale } = useUserPreferences()
  const { inbox, accountInboxReady } = useNexusNotifications()
  const [events, setEvents] = useState<FinancialEvent[]>([])
  const [deposits, setDeposits] = useState<CryptoDepositRow[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setEvents([])
        setDeposits([])
        setWithdrawals([])
        return
      }
      const h = { Authorization: `Bearer ${token}` }
      const [evRes, depRes, wRes] = await Promise.all([
        fetch("/api/user/financial-events", { headers: h, cache: "no-store" }),
        fetch("/api/user/crypto-deposit", { headers: h, cache: "no-store" }),
        fetch("/api/user/withdrawal-requests", { headers: h, cache: "no-store" }),
      ])
      if (evRes.ok) {
        const j = (await evRes.json()) as { events?: FinancialEvent[] }
        setEvents(j.events ?? [])
      }
      if (depRes.ok) {
        const j = (await depRes.json()) as { deposits?: CryptoDepositRow[] }
        setDeposits(j.deposits ?? [])
      }
      if (wRes.ok) {
        const j = (await wRes.json()) as { requests?: WithdrawalRow[] }
        setWithdrawals(j.requests ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const historyNotifs = useMemo(
    () => filterTransactionHistoryFromInbox([...inbox].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))),
    [inbox],
  )

  const viewer = useMemo(
    () => ({
      fundingCountryCode: country ?? null,
      displayCurrency: currency,
      locale,
    }),
    [country, currency, locale],
  )

  return (
    <div className="mx-auto w-full max-w-lg pb-24 pt-4 md:max-w-2xl md:pb-8">
      <header className="mb-4 flex items-center gap-3 px-1">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
          <Clock className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("nav.history")}</h1>
          <p className="text-sm text-muted-foreground">{t("history.center.subtitle")}</p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4 px-1">
          {withdrawals.length > 0 ? (
            <section className={`${INBOX_CARD} overflow-hidden`}>
              <div className="border-b border-border/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("history.section.withdrawals")}
                </p>
              </div>
              <ul className="divide-y divide-border/50">
                {withdrawals.map((w) => (
                  <li key={w.id} className="px-4 py-3">
                    <p className="text-sm font-semibold capitalize text-foreground">{w.status}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      ${Number(w.amount).toFixed(2)} · {w.transaction_ref.slice(0, 8)}…
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatNotificationTimeAgo(w.created_at, t)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {deposits.length > 0 ? (
            <section className={`${INBOX_CARD} overflow-hidden`}>
              <div className="border-b border-border/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("history.section.deposits")}
                </p>
              </div>
              <ul className="divide-y divide-border/50">
                {deposits.map((d) => (
                  <li key={d.id} className="px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">
                      {depositStatusLabel(String(d.status), t)}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      ${Number(d.amount_usd).toFixed(2)} · {d.tx_hash.slice(0, 8)}…
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatNotificationTimeAgo(d.created_at, t)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {events.length > 0 ? (
            <section className={`${INBOX_CARD} overflow-hidden`}>
              <div className="border-b border-border/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("history.section.activity")}
                </p>
              </div>
              <ul className="divide-y divide-border/50">
                {events.map((e) => {
                  const presented = presentFinancialEventForCustomer(e)
                  return (
                  <li key={e.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{presented.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{presented.detailLine}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatNotificationTimeAgo(e.created_at, t)}
                    </p>
                  </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {accountInboxReady && historyNotifs.length > 0 ? (
            <section className={`${INBOX_CARD} overflow-hidden`}>
              <div className="border-b border-border/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("history.section.accountNotices")}
                </p>
              </div>
              <ul className="divide-y divide-border/50">
                {historyNotifs.map((n) => {
                  const p = presentNotification(n, t, viewer)
                  return (
                    <li key={n.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{p.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{p.summary}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatNotificationTimeAgo(n.timestamp, t)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {!loading &&
          withdrawals.length === 0 &&
          deposits.length === 0 &&
          events.length === 0 &&
          historyNotifs.length === 0 ? (
            <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              {t("history.center.empty")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
