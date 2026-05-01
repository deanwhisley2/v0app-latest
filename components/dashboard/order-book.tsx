"use client"

import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { formatPrice } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"

interface OrderBookProps {
  selectedCoin: Coin
}

interface OrderEntry {
  price: number
  amount: number
  total: number
  percentage: number
}

function generateOrders(
  basePrice: number,
  type: "ask" | "bid",
  count: number = 8
): OrderEntry[] {
  const orders: OrderEntry[] = []
  let cumulativeTotal = 0
  const maxTotal = Math.random() * 50 + 20

  for (let i = 0; i < count; i++) {
    const spread = type === "ask" ? 1 + (i + 1) * 0.0005 : 1 - (i + 1) * 0.0005
    const price = basePrice * spread
    const amount = Math.random() * 2 + 0.1
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

export function OrderBook({ selectedCoin }: OrderBookProps) {
  const asks = useMemo(
    () => generateOrders(selectedCoin.price, "ask"),
    [selectedCoin.price]
  )
  const bids = useMemo(
    () => generateOrders(selectedCoin.price, "bid"),
    [selectedCoin.price]
  )

  return (
    <Card className="border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Order Book</h3>
        <span className="text-xs text-muted-foreground">{selectedCoin.symbol}/USDT</span>
      </div>

      {/* Header */}
      <div className="mb-2 grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground">
        <span>Price (USDT)</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (Sells) */}
      <div className="flex flex-col gap-0.5">
        {asks.map((order, i) => (
          <div
            key={`ask-${i}`}
            className="relative grid grid-cols-3 gap-2 rounded px-2 py-1 text-xs hover:bg-muted/30"
          >
            <div
              className="absolute inset-y-0 right-0 rounded bg-destructive/10"
              style={{ width: `${Math.min(order.percentage, 100)}%` }}
            />
            <span className="relative z-10 font-mono text-destructive">
              {formatPrice(order.price)}
            </span>
            <span className="relative z-10 text-right font-mono text-foreground">
              {order.amount.toFixed(4)}
            </span>
            <span className="relative z-10 text-right font-mono text-muted-foreground">
              {order.total.toFixed(4)}
            </span>
          </div>
        ))}
      </div>

      {/* Spread / Current Price */}
      <div className="my-3 flex items-center justify-center gap-2 rounded-lg bg-muted/50 py-2">
        <span className="font-mono text-lg font-bold text-primary">
          ${formatPrice(selectedCoin.price)}
        </span>
        <span
          className={`text-xs font-medium ${
            selectedCoin.change24h >= 0 ? "text-success" : "text-destructive"
          }`}
        >
          {selectedCoin.change24h >= 0 ? "+" : ""}
          {selectedCoin.change24h.toFixed(2)}%
        </span>
      </div>

      {/* Bids (Buys) */}
      <div className="flex flex-col gap-0.5">
        {bids.map((order, i) => (
          <div
            key={`bid-${i}`}
            className="relative grid grid-cols-3 gap-2 rounded px-2 py-1 text-xs hover:bg-muted/30"
          >
            <div
              className="absolute inset-y-0 right-0 rounded bg-success/10"
              style={{ width: `${Math.min(order.percentage, 100)}%` }}
            />
            <span className="relative z-10 font-mono text-success">
              {formatPrice(order.price)}
            </span>
            <span className="relative z-10 text-right font-mono text-foreground">
              {order.amount.toFixed(4)}
            </span>
            <span className="relative z-10 text-right font-mono text-muted-foreground">
              {order.total.toFixed(4)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
