"use client"

import { Flame, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Coin } from "@/lib/coins-data"
import { formatPrice } from "@/lib/coins-data"
import { ScrollArea } from "@/components/ui/scroll-area"

type TradeCoinExplorerProps = {
  newCoins: Coin[]
  trendingCoins: Coin[]
  selectedSymbol: string
  onSelectSymbol: (symbol: string) => void
  /** When set, replaces “New listings” (use accurate Binance-derived labels). */
  leftColumnTitle?: string
  rightColumnTitle?: string
}

function CoinRow({
  coin,
  active,
  onPick,
}: {
  coin: Coin
  active: boolean
  onPick: () => void
}) {
  const up = coin.change24h >= 0
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-2 border-b border-border/60 px-2 py-2 text-left text-sm transition-colors hover:bg-muted/50",
        active && "bg-primary/10 ring-1 ring-inset ring-primary/30"
      )}
    >
      <span
        className="h-7 w-7 flex-shrink-0 rounded-md"
        style={{ backgroundColor: `${coin.color}33`, borderLeft: `3px solid ${coin.color}` }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono font-semibold text-foreground">{coin.symbol}</span>
          <span className="text-xs text-muted-foreground">${formatPrice(coin.price)}</span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{coin.name}</div>
      </div>
      <span
        className={cn(
          "flex-shrink-0 font-mono text-xs font-medium tabular-nums",
          up ? "text-emerald-400" : "text-rose-400"
        )}
      >
        {up ? "+" : ""}
        {coin.change24h.toFixed(2)}%
      </span>
    </button>
  )
}

export function TradeCoinExplorer({
  newCoins,
  trendingCoins,
  selectedSymbol,
  onSelectSymbol,
  leftColumnTitle = "New listings",
  rightColumnTitle = "Trending",
}: TradeCoinExplorerProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Market explorer">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/40 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Sparkles className="h-4 w-4 text-cyan-400" aria-hidden />
          <h2 className="text-sm font-semibold tracking-wide text-foreground">{leftColumnTitle}</h2>
          <span className="ml-auto rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
            {newCoins.length}
          </span>
        </div>
        <ScrollArea className="h-[min(420px,55vh)] lg:h-[420px]">
          <div className="pr-2 pb-2">
            {newCoins.map((coin) => (
              <CoinRow
                key={coin.symbol}
                coin={coin}
                active={coin.symbol === selectedSymbol}
                onPick={() => onSelectSymbol(coin.symbol)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/40 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Flame className="h-4 w-4 text-orange-400" aria-hidden />
          <h2 className="text-sm font-semibold tracking-wide text-foreground">{rightColumnTitle}</h2>
          <span className="ml-auto rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-300">
            {trendingCoins.length}
          </span>
        </div>
        <ScrollArea className="h-[min(420px,55vh)] lg:h-[420px]">
          <div className="pr-2 pb-2">
            {trendingCoins.map((coin) => (
              <CoinRow
                key={coin.symbol}
                coin={coin}
                active={coin.symbol === selectedSymbol}
                onPick={() => onSelectSymbol(coin.symbol)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </section>
  )
}
