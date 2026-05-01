"use client"

import { TrendingUp, TrendingDown } from "lucide-react"
import { formatPrice } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"

interface TickerProps {
  coins: Coin[]
}

export function Ticker({ coins }: TickerProps) {
  // Duplicate for seamless loop
  const tickerCoins = [...coins, ...coins]

  return (
    <div className="border-y border-border bg-card/50 overflow-hidden">
      <div className="animate-ticker flex whitespace-nowrap py-2.5">
        {tickerCoins.map((coin, i) => (
          <div
            key={`${coin.symbol}-${i}`}
            className="inline-flex items-center gap-2 px-6 text-sm"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: coin.color }}
            />
            <span className="font-medium text-foreground">{coin.symbol}</span>
            <span className="font-mono text-muted-foreground">
              ${formatPrice(coin.price)}
            </span>
            <span
              className={`inline-flex items-center gap-1 font-medium ${
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
  )
}
