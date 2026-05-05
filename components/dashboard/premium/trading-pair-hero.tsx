"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import { formatPrice, formatVolume } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"
import { cn } from "@/lib/utils"

type TradingPairHeroProps = {
  coin: Coin
  /** Optional 24h stats when live (approx from coin fields). */
  high24h?: number
  low24h?: number
  quoteVolume?: number
  onPickSymbol?: (symbol: string) => void
  quickSymbols?: string[]
}

export function TradingPairHero({
  coin,
  high24h,
  low24h,
  quoteVolume,
  onPickSymbol,
  quickSymbols = ["BTC", "ETH", "SOL", "BNB", "XRP"],
}: TradingPairHeroProps) {
  const up = coin.change24h >= 0
  const estHigh = high24h ?? coin.price * (1 + Math.abs(coin.change24h) / 200)
  const estLow = low24h ?? coin.price * (1 - Math.abs(coin.change24h) / 200)
  const vol = quoteVolume ?? coin.volume

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0c0e12] via-[#080a0d] to-[#050608] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset,0_24px_80px_-24px_rgba(6,182,212,0.12)] md:p-7">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-emerald-500/5 blur-3xl" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-lg ring-2 ring-white/10 sm:h-16 sm:w-16 sm:text-xl"
            style={{
              background: `linear-gradient(145deg, ${coin.color}dd, ${coin.color}66)`,
              boxShadow: `0 12px 40px -8px ${coin.color}55`,
            }}
          >
            {coin.symbol.slice(0, 3)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-white md:text-3xl">
                {coin.symbol}
                <span className="text-zinc-500">/USDT</span>
              </h1>
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-xs font-medium text-zinc-400">
                Spot
              </span>
            </div>
            <p className="mt-1 truncate text-sm text-zinc-500">{coin.name}</p>

            <div className="mt-4 flex flex-wrap items-end gap-4 md:gap-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Last price</p>
                <p className="font-mono text-4xl font-bold tabular-nums tracking-tight text-white md:text-5xl">
                  {formatPrice(coin.price)}
                  <span className="ml-1 text-lg font-medium text-zinc-500 md:text-xl">USDT</span>
                </p>
              </div>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-lg font-semibold tabular-nums md:text-xl",
                  up
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25"
                    : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/25"
                )}
              >
                {up ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                <span>
                  {up ? "+" : ""}
                  {coin.change24h.toFixed(2)}%
                </span>
                <span className="text-xs font-normal text-zinc-500">24h</span>
              </div>
            </div>
          </div>
        </div>

        {onPickSymbol && (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {quickSymbols.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => onPickSymbol(sym)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition-all",
                  coin.symbol === sym
                    ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                    : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:border-white/15 hover:text-zinc-200"
                )}
              >
                {sym}
              </button>
            ))}
          </div>
        )}
      </div>

      <dl className="relative mt-6 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-6 sm:grid-cols-4">
        <Stat label="24h High" value={`$${formatPrice(estHigh)}`} accent="text-emerald-300/90" />
        <Stat label="24h Low" value={`$${formatPrice(estLow)}`} accent="text-rose-300/90" />
        <Stat label="24h Volume" value={formatVolume(vol)} accent="text-zinc-200" />
        <Stat label="24h Δ" value={`${up ? "+" : ""}${coin.change24h.toFixed(2)}%`} accent={up ? "text-emerald-300" : "text-rose-300"} />
      </dl>
    </section>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/30 px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={cn("mt-1 font-mono text-sm font-semibold tabular-nums md:text-base", accent)}>{value}</dd>
    </div>
  )
}
