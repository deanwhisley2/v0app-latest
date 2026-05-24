"use client"

import { TrendingUp, TrendingDown } from "lucide-react"
import { formatPrice } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"

interface TickerProps {
  coins: Coin[]
  /** On mobile: static row (no infinite transform animation). */
  mobileStatic?: boolean
}

function TickerRow({ coins }: { coins: Coin[] }) {
  return (
    <>
      {coins.map((coin, i) => (
        <span
          key={`${coin.symbol}-${i}`}
          className="inline-flex shrink-0 items-center gap-2 px-4 text-sm"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: coin.color }} />
          <span className="font-medium text-foreground">{coin.symbol}</span>
          <span className="font-mono text-muted-foreground">${formatPrice(coin.price)}</span>
          <span
            className={`inline-flex items-center gap-1 font-medium ${
              coin.change24h >= 0 ? "text-success" : "text-destructive"
            }`}
          >
            {coin.change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {coin.change24h >= 0 ? "+" : ""}
            {coin.change24h.toFixed(2)}%
          </span>
        </span>
      ))}
    </>
  )
}

export function Ticker({ coins, mobileStatic = false }: TickerProps) {
  const slice = coins.slice(0, 12)

  if (mobileStatic) {
    return (
      <>
        <div className="nexus-live-ticker border-y border-border bg-card md:hidden">
          <div className="flex gap-0 overflow-x-auto py-2.5 [-webkit-overflow-scrolling:touch] [overscroll-behavior-x:contain]">
            <TickerRow coins={slice} />
          </div>
        </div>
        <div className="hidden border-y border-border bg-card md:block md:overflow-hidden">
          <div className="animate-ticker flex whitespace-nowrap py-2.5">
            <TickerRow coins={[...slice, ...slice]} />
          </div>
        </div>
      </>
    )
  }

  const tickerCoins = [...coins, ...coins]
  return (
    <div className="overflow-hidden border-y border-border bg-card">
      <div className="animate-ticker flex whitespace-nowrap py-2.5">
        <TickerRow coins={tickerCoins} />
      </div>
    </div>
  )
}
