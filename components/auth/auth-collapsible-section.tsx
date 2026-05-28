"use client"

import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  open: boolean
  onToggle: () => void
  panelId: string
  children: ReactNode
  className?: string
}

export function AuthCollapsibleSection({ title, open, onToggle, panelId, children, className }: Props) {
  return (
    <section className={cn("rounded-lg border border-border/60 bg-muted/20", className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2.5 text-left touch-manipulation"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={panelId} className="border-t border-border/50 px-3 pb-3 pt-2 text-xs leading-relaxed text-muted-foreground">
          {children}
        </div>
      ) : null}
    </section>
  )
}
