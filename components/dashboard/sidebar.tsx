"use client"

import { TrendingUp, TrendingDown } from "lucide-react"
import { Card } from "@/components/ui/card"
import { formatPrice, getTopGainers, getTopLosers } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"

interface SidebarProps {
  coins: Coin[]
  portfolioTotal: number
  portfolioChange: number
}

export function Sidebar({ coins, portfolioTotal, portfolioChange }: SidebarProps) {
  const topMovers = [...getTopGainers(coins, 3), ...getTopLosers(coins, 2)]

  return (
    <aside className="hidden w-[240px] flex-shrink-0 lg:block">
      <Card className="border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Market pulse</p>
        <div className="flex flex-col gap-2">
          {topMovers.map((coin) => (
            <div
              key={coin.symbol}
              className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: coin.color }} />
                <span className="text-sm font-medium">{coin.symbol}</span>
              </div>
              <span
                className={`flex items-center gap-1 text-xs font-semibold ${
                  coin.change24h >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {coin.change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {coin.change24h >= 0 ? "+" : ""}
                {coin.change24h.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nexus Main</p>
          <div className="text-center">
            <p className="font-mono text-2xl font-bold text-primary">${formatPrice(portfolioTotal)}</p>
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                portfolioChange >= 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
              }`}
            >
              {portfolioChange >= 0 ? "+" : ""}
              {portfolioChange.toFixed(1)}% (24h est.)
            </span>
          </div>
        </div>
      </Card>
    </aside>
  )
}
