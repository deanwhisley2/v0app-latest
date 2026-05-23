import { cn } from "@/lib/utils"

/** Institutional panel — calm card surface (Binance-inspired spacing). */
export const NX_PANEL = "rounded-2xl border border-border bg-card shadow-sm"

export const NX_PANEL_PAD = "p-4 sm:p-5"

/** Soft tinted callout without heavy gradients. */
export const NX_SOFT_ACCENT = "rounded-2xl border border-border bg-muted/35"

export const NX_INFO_CALLOUT = "rounded-2xl border border-primary/20 bg-primary/5"

export const NX_PROMO_CALLOUT = "rounded-2xl border border-warning/25 bg-warning/8"

export const NX_STAT_TILE =
  "rounded-xl border border-border bg-muted/45 p-4 text-center transition-colors"

export const NX_TAB_ACTIVE = "bg-primary text-primary-foreground shadow-sm"

export const NX_TAB_INACTIVE =
  "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"

export function nexusPanel(className?: string) {
  return cn(NX_PANEL, NX_PANEL_PAD, className)
}
