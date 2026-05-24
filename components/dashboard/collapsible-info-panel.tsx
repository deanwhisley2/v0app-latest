"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { MOBILE_FLAT_SURFACE } from "@/lib/dashboard-mobile-render-policy"
import { NX_SURFACE_RAISED } from "@/lib/nexus-ui-surfaces"

export type CollapsibleInfoTone = "neutral" | "info" | "promo" | "warning" | "risk"

const toneClass: Record<CollapsibleInfoTone, string> = {
  neutral: "bg-card/95",
  info: "bg-primary/[0.04]",
  promo: "bg-accent/[0.05]",
  warning: "bg-warning/[0.05]",
  risk: "bg-destructive/[0.04]",
}

type Props = {
  storageKey?: string
  title: string
  summary: string
  children: ReactNode
  defaultOpen?: boolean
  tone?: CollapsibleInfoTone
  icon?: ReactNode
  trailing?: ReactNode
  className?: string
  viewDetailsLabel?: string
}

/** Compact preview + native details expand — calm premium surfaces, mobile-safe. */
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
  const [expanded, setExpanded] = useState(defaultOpen)

  useEffect(() => {
    if (!storageKey) return
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === "1" && detailsRef.current) {
        detailsRef.current.open = true
        setExpanded(true)
      } else if (stored === "0" && detailsRef.current) {
        detailsRef.current.open = false
        setExpanded(false)
      } else if (detailsRef.current) {
        detailsRef.current.open = defaultOpen
        setExpanded(defaultOpen)
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, defaultOpen])

  const onToggle = () => {
    const open = detailsRef.current?.open ?? false
    setExpanded(open)
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
        "nexus-collapsible-info group border-border/30",
        NX_SURFACE_RAISED,
        MOBILE_FLAT_SURFACE,
        toneClass[tone],
        className,
      )}
    >
      <summary
        className={cn(
          "flex min-h-[3.25rem] cursor-pointer list-none items-start gap-3 px-5 py-4 sm:min-h-[3.5rem] sm:px-6",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        {icon ? <div className="mt-0.5 shrink-0 opacity-90">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug tracking-tight text-foreground">{title}</p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{summary}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary/90">
            {viewDetailsLabel}
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180 max-md:transition-none"
              aria-hidden
            />
          </span>
        </div>
        {trailing ? <div className="shrink-0 self-center">{trailing}</div> : null}
      </summary>
      <div className="border-t border-border/25 px-5 pb-5 pt-3 text-[13px] leading-relaxed text-muted-foreground sm:px-6">
        {expanded ? children : null}
      </div>
    </details>
  )
}
