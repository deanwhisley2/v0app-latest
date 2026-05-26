"use client"

import { memo, useState } from "react"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Landmark,
  MoreHorizontal,
  Search,
  Shield,
  Trash2,
  TrendingUp,
  Wallet,
  Headphones,
  Info,
} from "lucide-react"
import type { NexusNotificationItem } from "@/lib/nexus-notification-models"
import {
  formatNotificationTimeAgo,
  presentNotification,
  type NotificationInboxCategory,
  type PresentedNotification,
} from "@/lib/notifications/notification-inbox-presenter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export const INBOX_CARD = "rounded-2xl border border-border/90 bg-card shadow-sm"

export type InboxFilter = "all" | "unread" | "read"

type CategoryStyle = { chip: string; icon: typeof Shield }

const CHIP_BASE = "border-border/60 bg-muted/25 text-muted-foreground"

export const CATEGORY_STYLE: Record<NotificationInboxCategory, CategoryStyle> = {
  security: { chip: CHIP_BASE, icon: Shield },
  funding: { chip: CHIP_BASE, icon: Wallet },
  withdrawals: { chip: CHIP_BASE, icon: Landmark },
  trading: { chip: CHIP_BASE, icon: TrendingUp },
  support: { chip: CHIP_BASE, icon: Headphones },
  system: { chip: CHIP_BASE, icon: Info },
}

const ICON_TINT: Record<NotificationInboxCategory, string> = {
  security: "text-muted-foreground/85",
  funding: "text-muted-foreground/85",
  withdrawals: "text-muted-foreground/85",
  trading: "text-muted-foreground/85",
  support: "text-muted-foreground/80",
  system: "text-muted-foreground/75",
}

function categoryIconBoxClass(category: NotificationInboxCategory, read: boolean): string {
  return cn(
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/30 ring-1 ring-inset ring-border/50",
    read && "opacity-75"
  )
}

function CategoryIcon({ category }: { category: NotificationInboxCategory }) {
  const Icon = CATEGORY_STYLE[category].icon
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", ICON_TINT[category])} aria-hidden />
}

export function NotificationInboxFilters({
  filter,
  onFilterChange,
  search,
  onSearchChange,
  searchPending = false,
  t,
  className,
}: {
  filter: InboxFilter
  onFilterChange: (f: InboxFilter) => void
  search: string
  onSearchChange: (q: string) => void
  /** True while deferred search lags typed input (responsive filtering). */
  searchPending?: boolean
  t: (key: string) => string
  className?: string
}) {
  const chips: { id: InboxFilter; label: string }[] = [
    { id: "all", label: t("notifications.inbox.filterAll") },
    { id: "unread", label: t("notifications.inbox.filterUnread") },
    { id: "read", label: t("notifications.inbox.filterRead") },
  ]

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("notifications.inbox.searchPlaceholder")}
          aria-label={t("notifications.inbox.searchPlaceholder")}
          className={cn(
            "min-h-11 border-border/70 bg-muted/15 ps-9 text-sm placeholder:text-muted-foreground/65 transition-opacity",
            searchPending && search.trim() && "opacity-90"
          )}
          autoComplete="off"
          enterKeyHint="search"
          inputMode="search"
        />
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            onClick={() => onFilterChange(c.id)}
            className={cn(
              "min-h-10 rounded-full border px-3.5 text-xs font-medium transition-colors",
              filter === c.id
                ? "border-border/80 bg-muted/40 text-foreground shadow-sm"
                : "border-transparent bg-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function NotificationInboxEmpty({
  message,
  hint,
  className,
}: {
  message: string
  hint?: string
  className?: string
}) {
  return (
    <div className={cn("px-4 py-12 text-center", className)}>
      <p className="text-sm font-medium text-foreground/85">{message}</p>
      {hint ? <p className="mx-auto mt-2 max-w-[18rem] text-xs leading-relaxed text-muted-foreground/90">{hint}</p> : null}
    </div>
  )
}

export const NotificationInboxRow = memo(function NotificationInboxRow({
  item,
  presented,
  onOpen,
  className,
  density = "default",
}: {
  item: NexusNotificationItem
  presented: PresentedNotification
  onOpen: () => void
  className?: string
  /** Panel sheet: flat rows without inset rings (fewer compositor layers on low-GPU Android). */
  density?: "default" | "panel"
}) {
  const style = CATEGORY_STYLE[presented.category]
  const isPanel = density === "panel"

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "notification-inbox-row flex w-full gap-2.5 px-3 py-3 text-start",
        isPanel
          ? cn(
              "touch-manipulation active:bg-muted/25",
              !item.read && "bg-muted/20",
              item.read && "bg-transparent opacity-90",
            )
          : cn(
              "transition-[background,box-shadow,opacity] duration-200 active:bg-muted/30",
              !item.read && "bg-card ring-1 ring-inset ring-border/80",
              item.read && "bg-transparent opacity-[0.82] hover:bg-muted/15 hover:opacity-95",
            ),
        className
      )}
    >
      <div className={categoryIconBoxClass(presented.category, item.read)}>
        <CategoryIcon category={presented.category} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
              style.chip
            )}
          >
            {presented.categoryLabel}
          </span>
          <span className="ms-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/90">
            {formatNotificationTimeAgo(item.timestamp)}
          </span>
        </div>
        <p
          className={cn(
            "mt-1 line-clamp-1 text-[13px] font-semibold leading-snug",
            item.read ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {presented.title}
        </p>
        <p
          className={cn(
            "mt-0.5 line-clamp-2 text-[11px] leading-[1.35]",
            item.read ? "text-muted-foreground/75" : "text-muted-foreground"
          )}
        >
          {presented.summary}
        </p>
        {presented.metaLine ? (
          <p className="mt-1 line-clamp-1 font-mono text-[10px] text-muted-foreground/60">{presented.metaLine}</p>
        ) : null}
      </div>
      {!item.read ? (
        <span
          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70 ring-2 ring-primary/15"
          aria-label="Unread"
        />
      ) : (
        <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/25" aria-hidden />
      )}
    </button>
  )
})

export function NotificationDetailSheet({
  item,
  presented,
  t,
  onClose,
  onArchive,
  onDelete,
  onOpenLinked,
  showArchive = true,
  archiveLabel,
}: {
  item: NexusNotificationItem
  presented: PresentedNotification
  t: (key: string) => string
  onClose: () => void
  onArchive: () => void
  onDelete: () => void
  onOpenLinked?: () => void
  showArchive?: boolean
  archiveLabel?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hasNav = item.nav && item.nav.kind !== "detail"

  useBodyScrollLock(true)

  return (
    <div
      className="nexus-notification-detail-scrim fixed inset-0 z-[210] flex flex-col bg-black/50 sm:items-center sm:justify-center sm:bg-black/45 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={cn(INBOX_CARD, "flex max-h-[min(92dvh,520px)] w-full max-w-md flex-col overflow-hidden sm:rounded-2xl")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2.5">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onClose}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                CATEGORY_STYLE[presented.category].chip
              )}
            >
              {presented.categoryLabel}
            </span>
            <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight text-foreground">{presented.title}</h2>
          </div>
          <div className="relative shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label={t("notifications.inbox.moreActions")}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {menuOpen ? (
              <div className="absolute end-0 top-full z-10 mt-1 min-w-[10rem] rounded-xl border border-border bg-card py-1 shadow-lg">
                {showArchive ? (
                  <button
                    type="button"
                    className="flex w-full min-h-[44px] items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/50"
                    onClick={() => {
                      onArchive()
                      setMenuOpen(false)
                    }}
                  >
                    <Archive className="h-4 w-4 text-muted-foreground" />
                    {archiveLabel ?? t("notifications.center.archive")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="flex w-full min-h-[44px] items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    onDelete()
                    setMenuOpen(false)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("notifications.center.delete")}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <div className="rounded-xl border border-border/45 bg-muted/12 px-3.5 py-3.5">
            <p className="text-[13px] font-medium leading-snug text-foreground">{presented.summary}</p>
          </div>
          <p className="mt-5 text-sm leading-[1.6] text-foreground/90">{presented.detail}</p>
          <div className="mt-6 flex flex-col gap-1 border-t border-border/35 pt-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/65">
              {t("notifications.inbox.detailRecorded")}
            </p>
            <p className="text-[11px] tabular-nums text-muted-foreground/85">
              {new Date(item.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
          {presented.metaLine ? (
            <div className="mt-4 rounded-lg border border-border/35 bg-muted/10 px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                {t("notifications.inbox.detailContext")}
              </p>
              <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground/75">{presented.metaLine}</p>
            </div>
          ) : null}
        </div>

        {hasNav ? (
          <div className="shrink-0 border-t border-border/60 bg-muted/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="secondary" className="min-h-11 w-full font-semibold" onClick={onOpenLinked}>
              <ChevronRight className="me-2 h-4 w-4 opacity-70" aria-hidden />
              {t("notifications.center.openLinked")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
