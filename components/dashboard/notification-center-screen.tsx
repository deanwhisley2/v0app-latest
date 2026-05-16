"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Archive, Bell, CheckCheck, ChevronLeft, Landmark, Trash2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useNexusNotifications, type NexusNotificationItem } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { supabase } from "@/lib/supabaseClient"
import { cn } from "@/lib/utils"
import { sanitizeCustomerNotificationText } from "@/lib/notifications/customer-notification-language"

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

function formatWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function previewText(message: string) {
  const t = message.trim()
  if (t.length <= 72) return t
  return `${t.slice(0, 69)}…`
}

/** Short, plain-language detail when we do not have a dedicated `detailText` from the server. */
function friendlyExplanation(n: NexusNotificationItem, t: (key: string) => string): string {
  const plain = t("notifications.center.detailBalancePlain")
  const d = n.detailText?.trim()
  if (d) return sanitizeCustomerNotificationText(d, plain)
  return sanitizeCustomerNotificationText(n.message, plain)
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
  const {
    inbox,
    markRead,
    markAllRead,
    deleteFromInbox,
    archiveFromInbox,
    runAppNavigation,
  } = useNexusNotifications()
  const [selected, setSelected] = useState<NexusNotificationItem | null>(null)
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
    const id = window.setInterval(() => void loadDeposits(true), 25_000)
    return () => window.clearInterval(id)
  }, [loadDeposits])

  const activeDeposits = useMemo(
    () => cryptoDeposits.filter((d) => isActiveDepositStatus(String(d.status ?? ""))),
    [cryptoDeposits],
  )

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
    <div className="mx-auto w-full max-w-lg pb-24 pt-4 md:max-w-2xl md:pb-8">
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

      {!depositsLoading && activeDeposits.length > 0 ? (
        <Card className="mb-4 overflow-hidden border-emerald-500/35 bg-emerald-500/[0.06]">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">{t("notifications.center.depositsTitle")}</p>
          </div>
          <ul className="divide-y divide-border/60">
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
                <li key={d.id} className="space-y-1 px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">{depositStatusLabel(status, t)}</p>
                  {verifying ? (
                    <p className="text-sm text-muted-foreground">{t("notifications.center.depositVerifying")}</p>
                  ) : null}
                  {crediting ? (
                    <p className="text-sm text-muted-foreground">{t("notifications.center.depositCreditingDelay")}</p>
                  ) : null}
                  {expected > 0 && (verifying || crediting) ? (
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      {t("notifications.center.depositAmountComing").replace("{{amount}}", expected.toFixed(2))}
                    </p>
                  ) : null}
                  {needsHelp ? (
                    <p className="text-sm text-destructive">{t("notifications.center.depositFailed")}</p>
                  ) : null}
                  <p className="pt-1 font-mono text-[10px] text-muted-foreground/70">
                    {d.tx_hash.slice(0, 10)}…{d.tx_hash.slice(-8)}
                  </p>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      <Card className="divide-y divide-border overflow-hidden border-border">
        {sorted.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {activeDeposits.length > 0
              ? t("notifications.center.depositsEmptyInbox")
              : t("notifications.center.empty")}
          </div>
        ) : (
          sorted.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openItem(n)}
              className={cn(
                "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40",
                !n.read && "bg-primary/[0.04]",
              )}
            >
              {n.type === "financial" ? (
                <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground">{n.title}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatWhen(n.timestamp)}</span>
                </div>
                <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {previewText(n.message)}
                </p>
              </div>
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
              <p className="mt-3 line-clamp-4 text-sm leading-snug text-foreground">
                {friendlyExplanation(selected, t)}
              </p>
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
