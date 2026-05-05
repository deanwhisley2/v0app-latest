"use client"

import { useState } from "react"
import { formatPrice } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PremiumOrderDeckProps = {
  coin: Coin
  onOrder: (type: "buy" | "sell", amount: number, leverage: number) => void
}

export function PremiumOrderDeck({ coin, onOrder }: PremiumOrderDeckProps) {
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market")
  const [amount, setAmount] = useState("")
  const [leverage, setLeverage] = useState(1)
  const [side, setSide] = useState<"buy" | "sell">("buy")

  const amt = parseFloat(amount) || 0
  const estMargin = amt > 0 ? (amt / leverage).toFixed(2) : "0.00"

  const execute = () => {
    if (amt <= 0) return
    onOrder(side, amt, leverage)
    setAmount("")
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0a0c10] to-[#050608] p-5 shadow-inner">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Place order</h3>
        <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-black/40 p-0.5">
          {(["market", "limit", "stop"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[10px] font-semibold capitalize transition-colors",
                orderType === t ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Sell left / Buy right — select side, then execute below */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={cn(
            "rounded-xl border-2 py-5 text-lg font-black uppercase tracking-wide transition-all",
            side === "sell"
              ? "border-rose-400 bg-rose-600/25 text-rose-50 shadow-[0_0_28px_-6px_rgba(244,63,94,0.5)]"
              : "border-rose-500/25 bg-rose-950/20 text-rose-200/70 hover:border-rose-500/50"
          )}
        >
          Sell
        </button>
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={cn(
            "rounded-xl border-2 py-5 text-lg font-black uppercase tracking-wide transition-all",
            side === "buy"
              ? "border-sky-400 bg-sky-600/25 text-sky-50 shadow-[0_0_28px_-6px_rgba(14,165,233,0.5)]"
              : "border-sky-500/25 bg-sky-950/20 text-sky-200/70 hover:border-sky-500/50"
          )}
        >
          Buy
        </button>
      </div>

      <div className="mb-3 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Price</p>
        <p className="font-mono text-sm text-white">
          {orderType === "market" ? "Market" : `$${formatPrice(coin.price)}`}
        </p>
      </div>

      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Amount (USDT)
      </label>
      <Input
        type="number"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3 border-white/[0.08] bg-black/40 font-mono text-base text-white placeholder:text-zinc-600"
      />

      <div className="mb-4 flex gap-2">
        {[25, 50, 75, 100].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(p.toString())}
            className="flex-1 rounded-lg border border-white/[0.06] py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-cyan-500/30 hover:text-white"
          >
            {p}%
          </button>
        ))}
      </div>

      <div className="mb-4">
        <div className="mb-2 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          <span>Leverage</span>
          <span className="font-mono text-cyan-300">{leverage}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={20}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full accent-cyan-500"
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-black/30 p-3 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Est. margin</p>
          <p className="font-mono font-semibold text-white">${estMargin}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Side</p>
          <p className={cn("font-mono font-semibold", side === "buy" ? "text-sky-300" : "text-rose-300")}>
            {side.toUpperCase()}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={execute}
        disabled={amt <= 0}
        className={cn(
          "w-full rounded-xl py-3.5 text-sm font-bold uppercase tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-40",
          side === "buy"
            ? "bg-gradient-to-r from-sky-600 to-cyan-600 text-white hover:from-sky-500 hover:to-cyan-500"
            : "bg-gradient-to-r from-rose-600 to-orange-600 text-white hover:from-rose-500 hover:to-orange-500"
        )}
      >
        {side === "buy" ? "Buy" : "Sell"} {coin.symbol}
      </button>
    </div>
  )
}
