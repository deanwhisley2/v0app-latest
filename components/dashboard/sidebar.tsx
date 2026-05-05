"use client"

import {
  Activity,
  Clock,
  Bookmark,
  Star,
  BarChart3,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { formatPrice, getTopGainers, getTopLosers } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"
import type { DashboardTradeView } from "@/lib/dashboard-trade-view"
import { TRADE_VIEW_LABELS } from "@/lib/dashboard-trade-view"
import { cn } from "@/lib/utils"

interface SidebarProps {
  coins: Coin[]
  portfolioTotal: number
  portfolioChange: number
  activeTradeView?: DashboardTradeView
  onTradeViewChange?: (view: DashboardTradeView) => void
}

const NAV_ITEMS: {
  id: DashboardTradeView
  icon: typeof Activity
}[] = [
  { id: "live-trading", icon: Activity },
  { id: "order-history", icon: Clock },
  { id: "watchlist", icon: Bookmark },
  { id: "favorites", icon: Star },
  { id: "analytics", icon: BarChart3 },
]

export function Sidebar({
  coins,
  portfolioTotal,
  portfolioChange,
  activeTradeView = "live-trading",
  onTradeViewChange,
}: SidebarProps) {
  const topMovers = [...getTopGainers(coins, 3), ...getTopLosers(coins, 2)]

  return (
    <aside className="hidden w-[240px] flex-shrink-0 lg:block">
      <Card className="border-border bg-card p-4">
        {/* Navigation */}
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Markets
        </p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTradeViewChange?.(id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                activeTradeView === id
                  ? "border-l-2 border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {TRADE_VIEW_LABELS[id]}
            </button>
          ))}
        </nav>

        {/* Top Movers */}
        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Top Movers
          </p>
          <div className="flex flex-col gap-2">
            {topMovers.map((coin) => (
              <div
                key={coin.symbol}
                className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: coin.color }}
                  />
                  <span className="text-sm font-medium">{coin.symbol}</span>
                </div>
                <span
                  className={`flex items-center gap-1 text-xs font-semibold ${
                    coin.change24h >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {coin.change24h >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {coin.change24h >= 0 ? "+" : ""}
                  {coin.change24h.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Portfolio Summary */}
        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Portfolio
          </p>
          <div className="text-center">
            <p className="font-mono text-2xl font-bold text-primary">
              ${formatPrice(portfolioTotal)}
            </p>
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                portfolioChange >= 0
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {portfolioChange >= 0 ? "+" : ""}
              {portfolioChange.toFixed(1)}% this week
            </span>
            {/* Progress Bar */}
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-success"
                style={{ width: "68%" }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              68% portfolio allocated
            </p>
          </div>
        </div>
      </Card>
    </aside>
  )
}
