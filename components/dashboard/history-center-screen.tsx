"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Clock, Loader2 } from "lucide-react"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { supabase } from "@/lib/supabaseClient"
import { filterTransactionHistoryFromInbox } from "@/lib/notifications/inbox-routing"
import { presentNotification } from "@/lib/notifications/notification-inbox-presenter"
import { presentFinancialEventForCustomer } from "@/lib/notifications/financial-event-presenter"
import { INBOX_CARD } from "@/components/dashboard/notification-inbox-ui"
import { TransactionHistoryRow } from "@/components/dashboard/transaction-history-row"
import { TransactionReceiptSheet } from "@/components/dashboard/transaction-receipt-sheet"
import { useTransactionReceiptOpener } from "@/hooks/use-transaction-receipt"
import {
  depositTimelineLabelKey,
  withdrawalTimelineLabelKey,
  type CryptoDepositReceiptRow,
  type FinancialEventReceiptRow,
  type WithdrawalReceiptRow,
} from "@/lib/transactions/transaction-receipt-model"

type FinancialEvent = FinancialEventReceiptRow

export function HistoryCenterScreen() {
  const { t, currency, country, locale } = useUserPreferences()
  const { inbox, accountInboxReady } = useNexusNotifications()
  const [events, setEvents] = useState<FinancialEvent[]>([])
  const [deposits, setDeposits] = useState<CryptoDepositReceiptRow[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalReceiptRow[]>([])
  const [loading, setLoading] = useState(true)

  const viewer = useMemo(
    () => ({
      fundingCountryCode: country ?? null,
      displayCurrency: currency,
      locale,
    }),
    [country, currency, locale],
  )

  const {
    receipt,
    receiptOpen,
    closeReceipt,
    openWithdrawal,
    openDeposit,
    openFinancialEvent,
    openNotification,
  } = useTransactionReceiptOpener(t, viewer)

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
        const j = (await depRes.json()) as { deposits?: CryptoDepositReceiptRow[] }
        setDeposits(j.deposits ?? [])
      }
      if (wRes.ok) {
        const j = (await wRes.json()) as { requests?: WithdrawalReceiptRow[] }
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
                  <TransactionHistoryRow
                    key={w.id}
                    title={t(withdrawalTimelineLabelKey(w))}
                    subtitle={`$${Number(w.amount).toFixed(2)} · ${w.transaction_ref.slice(0, 8)}…`}
                    timestamp={w.created_at}
                    t={t}
                    onOpen={() => openWithdrawal(w)}
                  />
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
                  <TransactionHistoryRow
                    key={d.id}
                    title={t(depositTimelineLabelKey(d))}
                    subtitle={`$${Number(d.amount_usd).toFixed(2)} · ${d.tx_hash.slice(0, 8)}…`}
                    timestamp={d.created_at}
                    t={t}
                    onOpen={() => openDeposit(d)}
                  />
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
                    <TransactionHistoryRow
                      key={e.id}
                      title={presented.title}
                      subtitle={presented.detailLine}
                      timestamp={e.created_at}
                      t={t}
                      onOpen={() => openFinancialEvent(e)}
                    />
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
                    <TransactionHistoryRow
                      key={n.id}
                      title={p.title}
                      subtitle={p.summary}
                      timestamp={n.timestamp}
                      t={t}
                      onOpen={() => void openNotification(n)}
                    />
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

      <TransactionReceiptSheet
        open={receiptOpen}
        receipt={receipt}
        t={t}
        locale={locale}
        onClose={closeReceipt}
      />
    </div>
  )
}
