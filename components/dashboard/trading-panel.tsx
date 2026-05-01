"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatPrice } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"

interface TradingPanelProps {
  selectedCoin: Coin
  onOrder: (type: "buy" | "sell", amount: number, leverage: number) => void
}

export function TradingPanel({ selectedCoin, onOrder }: TradingPanelProps) {
  const [orderType, setOrderType] = useState<"market" | "limit">("market")
  const [tradeDirection, setTradeDirection] = useState<"buy" | "sell">("buy")
  const [amount, setAmount] = useState("")
  const [leverage, setLeverage] = useState(1)

  const leverageOptions = [1, 2, 5, 10, 20]
  const presetAmounts = [25, 50, 75, 100]

  const handleSubmit = () => {
    const numAmount = parseFloat(amount)
    if (numAmount > 0) {
      onOrder(tradeDirection, numAmount, leverage)
      setAmount("")
    }
  }

  return (
    <Card className="border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-semibold">Place Order</h3>

      {/* Buy/Sell Toggle */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setTradeDirection("buy")}
          className={`rounded-lg py-2.5 text-sm font-bold transition-all ${
            tradeDirection === "buy"
              ? "bg-success text-success-foreground shadow-lg shadow-success/30"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          BUY
        </button>
        <button
          onClick={() => setTradeDirection("sell")}
          className={`rounded-lg py-2.5 text-sm font-bold transition-all ${
            tradeDirection === "sell"
              ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          SELL
        </button>
      </div>

      {/* Order Type */}
      <div className="mb-4 flex gap-2">
        {(["market", "limit"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setOrderType(type)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              orderType === type
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Price Display */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs text-muted-foreground">
          Price (USDT)
        </label>
        <div className="rounded-lg border border-border bg-input px-3 py-2.5">
          <span className="font-mono text-sm">
            {orderType === "market" ? "Market Price" : `$${formatPrice(selectedCoin.price)}`}
          </span>
        </div>
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs text-muted-foreground">
          Amount (USDT)
        </label>
        <Input
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="font-mono"
        />
        {/* Preset Amounts */}
        <div className="mt-2 flex gap-2">
          {presetAmounts.map((preset) => (
            <button
              key={preset}
              onClick={() => setAmount(preset.toString())}
              className="flex-1 rounded border border-border py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {preset}%
            </button>
          ))}
        </div>
      </div>

      {/* Leverage */}
      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Leverage</label>
          <span className="font-mono text-sm font-semibold text-primary">
            {leverage}x
          </span>
        </div>
        <div className="flex gap-2">
          {leverageOptions.map((lev) => (
            <button
              key={lev}
              onClick={() => setLeverage(lev)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
                leverage === lev
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {lev}x
            </button>
          ))}
        </div>
      </div>

      {/* Total */}
      {amount && (
        <div className="mb-4 rounded-lg bg-muted/50 p-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono font-medium">
              ~{((parseFloat(amount) || 0) / selectedCoin.price).toFixed(6)} {selectedCoin.symbol}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-muted-foreground">With Leverage</span>
            <span className="font-mono font-medium text-primary">
              ~{(((parseFloat(amount) || 0) * leverage) / selectedCoin.price).toFixed(6)} {selectedCoin.symbol}
            </span>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        className={`w-full py-5 font-mono text-sm font-bold ${
          tradeDirection === "buy"
            ? "bg-success hover:bg-success/90 text-success-foreground shadow-lg shadow-success/30"
            : "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg shadow-destructive/30"
        }`}
      >
        {tradeDirection === "buy" ? "BUY" : "SELL"} {selectedCoin.symbol}
      </Button>
    </Card>
  )
}
