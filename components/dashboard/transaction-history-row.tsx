"use client"

import { ChevronRight } from "lucide-react"
import { formatNotificationTimeAgo } from "@/lib/notifications/notification-inbox-presenter"
import { cn } from "@/lib/utils"

type TransactionHistoryRowProps = {
  title: string
  subtitle: string
  timestamp: string
  onOpen: () => void
  t: (key: string) => string
  /** Declined/rejected withdrawal — crimson title tint. */
  declined?: boolean
  /** Admin resolution note shown under subtitle when present. */
  declineReason?: string | null
}

/** Compact, tappable history timeline row (GPU-safe — no hover transitions on low-end). */
export function TransactionHistoryRow({
  title,
  subtitle,
  timestamp,
  onOpen,
  t,
  declined = false,
  declineReason,
}: TransactionHistoryRowProps) {
  const reason = declineReason?.trim()
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "transaction-history-row flex w-full gap-2 px-4 py-3 text-start touch-manipulation",
          "active:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
      >
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-semibold leading-snug",
              declined ? "text-rose-900/90 dark:text-rose-300/95" : "text-foreground",
            )}
          >
            {title}
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{subtitle}</p>
          {reason ? (
            <p className="mt-1 text-xs italic text-slate-400">
              {t("history.withdrawal.declineReasonPrefix")} {reason}
            </p>
          ) : null}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {formatNotificationTimeAgo(timestamp, t)}
          </p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
      </button>
    </li>
  )
}
