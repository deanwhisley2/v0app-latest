"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type CollapsibleInfoTone = "neutral" | "info" | "promo" | "warning" | "risk"

const toneClass: Record<CollapsibleInfoTone, string> = {
  neutral: "border-border/60 bg-card",
  info: "border-primary/20 bg-primary/5",
  promo: "border-accent/25 bg-accent/5",
  warning: "border-warning/25 bg-warning/5",
  risk: "border-destructive/25 bg-destructive/5",
}

type Props = {
  /** Persist open state: "1" = user left it open */
  storageKey?: string
  title: string
  summary: string
  children: ReactNode
  defaultOpen?: boolean
  tone?: CollapsibleInfoTone
  icon?: ReactNode
  /** Shown on the summary row (e.g. CTA) */
  trailing?: ReactNode
  className?: string
  viewDetailsLabel?: string
}

/** Compact preview + native details expand — mobile-safe, no heavy animations. */
export function CollapsibleInfoPanel({
  storageKey,
  title,
  summary,
  children,
  defaultOpen = false,
  tone = "neutral",
  icon,
  trailing,
  className,
  viewDetailsLabel = "View details",
}: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (!storageKey) return
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === "1" && detailsRef.current) detailsRef.current.open = true
      else if (stored === "0" && detailsRef.current) detailsRef.current.open = false
      else if (detailsRef.current) detailsRef.current.open = defaultOpen
    } catch {
      /* ignore */
    }
  }, [storageKey, defaultOpen])

  const onToggle = () => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, detailsRef.current?.open ? "1" : "0")
    } catch {
      /* ignore */
    }
  }

  return (
    <details
      ref={detailsRef}
      onToggle={onToggle}
      className={cn(
        "nexus-collapsible-info group rounded-2xl border shadow-[var(--shadow-card)]",
        toneClass[tone],
        className,
      )}
    >
      <summary
        className={cn(
          "flex min-h-[52px] cursor-pointer list-none items-start gap-3 px-4 py-3.5 sm:px-5",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{summary}</p>
          <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
            {viewDetailsLabel}
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </span>
        </div>
        {trailing ? <div className="shrink-0 self-center">{trailing}</div> : null}
      </summary>
      <div className="border-t border-border/50 px-4 pb-4 pt-2 text-sm text-muted-foreground sm:px-5">
        {children}
      </div>
    </details>
  )
}
