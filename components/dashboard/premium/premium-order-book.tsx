"use client"

import { useMemo } from "react"
import { formatPrice } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"

interface OrderEntry {
  price: number
  amount: number
  total: number
  percentage: number
}

function generateOrders(basePrice: number, type: "ask" | "bid", count = 11): OrderEntry[] {
  const orders: OrderEntry[] = []
  let cumulativeTotal = 0
  const maxTotal = 42 + Math.random() * 18

  for (let i = 0; i < count; i++) {
    const spread = type === "ask" ? 1 + (i + 1) * 0.00035 : 1 - (i + 1) * 0.00035
    const price = basePrice * spread
    const amount = Math.random() * 1.8 + 0.08
    cumulativeTotal += amount
    orders.push({
      price,
      amount,
      total: cumulativeTotal,
      percentage: (cumulativeTotal / maxTotal) * 100,
    })
  }

  return type === "ask" ? orders : orders.reverse()
}

type PremiumOrderBookProps = {
  coin: Coin
}

export function PremiumOrderBook({ coin }: PremiumOrderBookProps) {
  const asks = useMemo(() => generateOrders(coin.price, "ask"), [coin.price])
  const bids = useMemo(() => generateOrders(coin.price, "bid"), [coin.price])

  return (
    <div className="flex h-full min-h-[320px] flex-col rounded-2xl border border-white/[0.08] bg-[#07090d] shadow-inner">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Order book</h3>
        <span className="font-mono text-[10px] text-zinc-500">{coin.symbol}/USDT</span>
      </div>

      <div className="grid grid-cols-3 gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="scrollbar-thin flex flex-1 flex-col gap-px overflow-y-auto px-1">
          {asks.map((order, i) => (
            <div
              key={`ask-${i}`}
              className="relative grid grid-cols-3 gap-2 rounded-md px-2 py-1 font-mono text-[11px] tabular-nums"
            >
              <div
                className="absolute inset-y-0 right-0 rounded-sm bg-rose-500/[0.12]"
                style={{ width: `${Math.min(order.percentage, 100)}%` }}
              />
              <span className="relative z-10 text-rose-300">{formatPrice(order.price)}</span>
              <span className="relative z-10 text-right text-zinc-300">{order.amount.toFixed(4)}</span>
              <span className="relative z-10 text-right text-zinc-500">{order.total.toFixed(4)}</span>
            </div>
          ))}
        </div>

        <div className="my-2 flex items-center justify-center border-y border-white/[0.06] bg-black/40 py-2.5">
          <span className="font-mono text-lg font-bold text-white">{formatPrice(coin.price)}</span>
          <span
            className={`ml-2 text-xs font-semibold ${coin.change24h >= 0 ? "text-emerald-400" : "text-rose-400"}`}
          >
            {coin.change24h >= 0 ? "+" : ""}
            {coin.change24h.toFixed(2)}%
          </span>
        </div>

        <div className="scrollbar-thin flex flex-1 flex-col gap-px overflow-y-auto px-1 pb-2">
          {bids.map((order, i) => (
            <div
              key={`bid-${i}`}
              className="relative grid grid-cols-3 gap-2 rounded-md px-2 py-1 font-mono text-[11px] tabular-nums"
            >
              <div
                className="absolute inset-y-0 right-0 rounded-sm bg-emerald-500/[0.12]"
                style={{ width: `${Math.min(order.percentage, 100)}%` }}
              />
              <span className="relative z-10 text-emerald-300">{formatPrice(order.price)}</span>
              <span className="relative z-10 text-right text-zinc-300">{order.amount.toFixed(4)}</span>
              <span className="relative z-10 text-right text-zinc-500">{order.total.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
