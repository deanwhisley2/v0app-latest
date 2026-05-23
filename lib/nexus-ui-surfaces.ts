import { cn } from "@/lib/utils"

/** Premium panel — navy/emerald ecosystem, soft elevation */
export const NX_PANEL =
  "rounded-2xl border border-border/50 bg-card/95 shadow-[var(--shadow-card)] backdrop-blur-[2px]"

export const NX_PANEL_PAD = "p-5 sm:p-6"

/** Soft tinted callout */
export const NX_SOFT_ACCENT =
  "rounded-2xl border border-border/45 bg-muted/30 shadow-[var(--shadow-card)]"

export const NX_INFO_CALLOUT =
  "rounded-2xl border border-primary/15 bg-primary/6 shadow-[var(--shadow-card)]"

/** Luxury gold accent — small surfaces only */
export const NX_PROMO_CALLOUT =
  "rounded-2xl border border-accent/20 bg-accent/8 shadow-[var(--shadow-card)]"

export const NX_STAT_TILE =
  "nexus-stat-tile p-4 sm:p-5 text-center transition-colors"

export const NX_TAB_ACTIVE =
  "bg-primary/90 text-primary-foreground shadow-sm ring-1 ring-primary/20"

export const NX_TAB_INACTIVE =
  "bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground"

export const NX_GROWTH_BADGE =
  "inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary"

export function nexusPanel(className?: string) {
  return cn(NX_PANEL, NX_PANEL_PAD, className)
}
