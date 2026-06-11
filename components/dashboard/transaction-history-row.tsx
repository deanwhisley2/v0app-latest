"use client"

import { ChevronRight, Landmark, Shield, TrendingUp, Wallet, Info } from "lucide-react"
import { formatNotificationTimeAgo, type NotificationInboxCategory } from "@/lib/notifications/notification-inbox-presenter"
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

/**
 * Infer notification category from the title text.
 */
function inferCategory(title: string, subtitle: string): NotificationInboxCategory {
  const c = `${title} ${subtitle}`.toLowerCase()
  if (/earnings?|credit|releas|trade|session|signal|bot|trading|profit/i.test(c)) return "trading"
  if (/withdraw|payout|settlement/i.test(c)) return "withdrawals"
  if (/deposit|fund|wallet|balance|transfer/i.test(c)) return "funding"
  if (/security|login|sign.?in|password|device/i.test(c)) return "security"
  if (/support|appeal|thread|ticket/i.test(c)) return "support"
  return "system"
}

function categoryIcon(category: NotificationInboxCategory): typeof TrendingUp {
  switch (category) {
    case "trading": return TrendingUp
    case "funding": return Wallet
    case "withdrawals": return Landmark
    case "security": return Shield
    default: return Info
  }
}

const ICON_TINT: Record<NotificationInboxCategory, string> = {
  security: "text-muted-foreground/85",
  funding: "text-muted-foreground/85",
  withdrawals: "text-muted-foreground/85",
  trading: "text-muted-foreground/85",
  support: "text-muted-foreground/80",
  system: "text-muted-foreground/75",
}

const CATEGORY_LABEL: Record<NotificationInboxCategory, string> = {
  trading: "Trading",
  funding: "Funding",
  withdrawals: "Withdrawal",
  security: "Security",
  support: "Support",
  system: "System",
}

/**
 * Detect if a title or subtitle indicates this was an earnings/credit event.
 */
function isEarningsEvent(title: string, subtitle?: string): boolean {
  if (/earnings?\s+credit|credit(?:ed)?.*earnings?|released?\s+earnings?|earnings?\s+release/i.test(title)) return true
  if (/trading\s+update/i.test(title) && subtitle && /earnings?|credit|profit/i.test(subtitle)) return true
  return false
}

const EARNINGS_AMOUNT_CSS = "text-emerald-400 dark:text-emerald-400 font-semibold drop-shadow-[0_0_6px_rgba(52,211,153,0.3)]"

/** History row styled like NotificationInboxRow — consistent, professional look. */
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
  const isEarnings = !declined && isEarningsEvent(title, subtitle)
  const category = inferCategory(title, subtitle)
  const Icon = categoryIcon(category)

  // For earnings, split subtitle at the currency amount so we can highlight it
  const subtitleParts = isEarnings
    ? subtitle.split(/([A-Z]{3,4}\s*[\d,]+(?:\.\d+)?)/)
    : null

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full gap-2.5 px-3 py-3 text-start touch-manipulation",
          "active:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
      >
        {/* Category icon box */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/30 ring-1 ring-inset ring-border/50">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", ICON_TINT[category])} aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          {/* Top row: category chip + timestamp */}
          <div className="flex items-center gap-1.5">
            <span className="rounded border border-border/60 bg-muted/25 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABEL[category]}
            </span>
            <span className="ms-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/90">
              {formatNotificationTimeAgo(timestamp)}
            </span>
          </div>

          {/* Title */}
          <p
            className={cn(
              "mt-1 text-[13px] font-semibold leading-snug",
              declined ? "text-rose-900/90 dark:text-rose-300/95" : "text-foreground",
            )}
          >
            {title}
          </p>

          {/* Subtitle / Summary */}
          {subtitleParts ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.35] text-muted-foreground">
              {subtitleParts.map((part, i) => {
                if (i % 2 === 1) {
                  return (
                    <span key={i} className={EARNINGS_AMOUNT_CSS}>
                      +{part.trim()}
                    </span>
                  )
                }
                return <span key={i}>{part}</span>
              })}
            </p>
          ) : (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.35] text-muted-foreground">{subtitle}</p>
          )}

          {reason ? (
            <p className="mt-1 text-xs italic text-slate-400">
              {t("history.withdrawal.declineReasonPrefix")} {reason}
            </p>
          ) : null}
        </div>

        <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/25" aria-hidden />
      </button>
    </li>
  )
}
