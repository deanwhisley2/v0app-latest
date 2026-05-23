import { cn } from "@/lib/utils"

/** Premium panel — soft elevation, minimal border */
export const NX_PANEL =
  "rounded-[1.25rem] border border-border/35 bg-card shadow-[var(--shadow-card)]"

export const NX_PANEL_PAD = "p-5 sm:p-6"

/** Elevated inner surface (slightly lifted from page background) */
export const NX_SURFACE_RAISED =
  "rounded-[1.25rem] border border-border/25 bg-card/90 shadow-[var(--shadow-card)]"

export const NX_SOFT_ACCENT =
  "rounded-[1.25rem] border border-border/30 bg-muted/25 shadow-[var(--shadow-card)]"

export const NX_INFO_CALLOUT =
  "rounded-[1.25rem] border border-primary/12 bg-primary/5 shadow-[var(--shadow-card)]"

/** Gold accent — CTAs and promos only */
export const NX_PROMO_CALLOUT =
  "rounded-[1.25rem] border border-accent/15 bg-accent/6 shadow-[var(--shadow-card)]"

export const NX_STAT_TILE =
  "nexus-stat-tile p-4 sm:p-5 text-center transition-colors"

export const NX_TAB_ACTIVE =
  "bg-primary/85 text-primary-foreground shadow-sm ring-1 ring-primary/15"

export const NX_TAB_INACTIVE =
  "bg-muted/40 text-muted-foreground hover:bg-muted/55 hover:text-foreground"

export const NX_GROWTH_BADGE =
  "inline-flex items-center gap-1 rounded-full border border-primary/12 bg-primary/6 px-2.5 py-1 text-xs font-medium text-primary"

/** Primary money action — emerald */
export const NX_BTN_PRIMARY =
  "min-h-11 rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"

/** Premium highlight — gold, use sparingly */
export const NX_BTN_ACCENT =
  "min-h-11 rounded-xl bg-accent/90 font-semibold text-accent-foreground shadow-sm hover:bg-accent/80"

export function nexusPanel(className?: string) {
  return cn(NX_PANEL, NX_PANEL_PAD, className)
}
