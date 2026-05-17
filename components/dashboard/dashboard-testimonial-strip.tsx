"use client"

import { MessageSquare, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  visible: boolean
  text: string
  onDismiss: () => void
  /** Shown under the quote (e.g. Container Mode vs community strip on auth). */
  subtitle?: string
  /** Mobile: in document flow above wallet cards (no fixed overlay). */
  inFlowOnMobile?: boolean
}

export function DashboardTestimonialStrip({
  visible,
  text,
  onDismiss,
  subtitle = "Container Mode",
  inFlowOnMobile = false,
}: Props) {
  if (!visible || !text) return null

  return (
    <div
      className={cn(
        "pointer-events-none max-w-[min(22rem,calc(100%-2rem))]",
        inFlowOnMobile
          ? "nexus-testimonial-in-flow relative z-0 mx-0 w-full max-w-none md:fixed md:bottom-24 md:left-4 md:right-auto md:z-[45] md:animate-in md:slide-in-from-left md:duration-300"
          : "fixed bottom-[7.25rem] left-4 right-4 z-[45] animate-in slide-in-from-left duration-300 md:bottom-24 md:right-auto"
      )}
    >
      <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <MessageSquare className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{text}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
