"use client"

import { MessageSquare, X } from "lucide-react"

type Props = {
  visible: boolean
  text: string
  onDismiss: () => void
}

/** Same corner style as Container join toasts; sits slightly higher to reduce overlap. */
export function DashboardTestimonialStrip({ visible, text, onDismiss }: Props) {
  if (!visible || !text) return null

  return (
    <div className="pointer-events-none fixed bottom-28 left-4 right-4 z-[55] max-w-[min(22rem,calc(100%-2rem))] animate-in slide-in-from-left duration-300 md:bottom-24 md:right-auto">
      <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-primary/30 bg-card px-4 py-3 shadow-lg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
          <MessageSquare className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{text}</p>
          <p className="mt-1 text-xs text-muted-foreground">Container Mode</p>
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
