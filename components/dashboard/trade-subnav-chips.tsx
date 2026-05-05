"use client"

import type { DashboardTradeView } from "@/lib/dashboard-trade-view"
import { TRADE_VIEW_SHORT } from "@/lib/dashboard-trade-view"
import { cn } from "@/lib/utils"

const ORDER: DashboardTradeView[] = [
  "live-trading",
  "order-history",
  "watchlist",
  "favorites",
  "analytics",
]

type TradeSubnavChipsProps = {
  active: DashboardTradeView
  onChange: (view: DashboardTradeView) => void
  className?: string
}

export function TradeSubnavChips({ active, onChange, className }: TradeSubnavChipsProps) {
  return (
    <div
      className={cn(
        "scrollbar-none flex gap-1.5 overflow-x-auto rounded-xl border border-border bg-muted/30 p-1.5",
        className
      )}
    >
      {ORDER.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "shrink-0 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors",
            active === id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background hover:text-foreground"
          )}
        >
          {TRADE_VIEW_SHORT[id]}
        </button>
      ))}
    </div>
  )
}
