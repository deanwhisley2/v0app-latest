"use client"

import { useMemo, useState } from "react"
import { Filter, Search } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type OrderHistoryRow = {
  id: string
  time: string
  pair: string
  side: "buy" | "sell"
  type: "market" | "limit"
  qty: string
  filled: string
  avgPrice: string
  status: "filled" | "cancelled" | "partial"
  fee: string
}

const MOCK_ORDERS: OrderHistoryRow[] = [
  {
    id: "1",
    time: "2026-05-03 14:22",
    pair: "BTC/USDT",
    side: "buy",
    type: "limit",
    qty: "0.015",
    filled: "0.015",
    avgPrice: "97,842.10",
    status: "filled",
    fee: "0.42 USDT",
  },
  {
    id: "2",
    time: "2026-05-03 11:05",
    pair: "ETH/USDT",
    side: "sell",
    type: "market",
    qty: "2.0",
    filled: "2.0",
    avgPrice: "2,291.55",
    status: "filled",
    fee: "1.83 USDT",
  },
  {
    id: "3",
    time: "2026-05-02 09:40",
    pair: "SOL/USDT",
    side: "buy",
    type: "limit",
    qty: "40",
    filled: "18",
    avgPrice: "156.20",
    status: "partial",
    fee: "0.61 USDT",
  },
  {
    id: "4",
    time: "2026-05-01 18:12",
    pair: "LINK/USDT",
    side: "buy",
    type: "limit",
    qty: "120",
    filled: "0",
    avgPrice: "—",
    status: "cancelled",
    fee: "—",
  },
  {
    id: "5",
    time: "2026-04-30 08:55",
    pair: "AVAX/USDT",
    side: "sell",
    type: "market",
    qty: "85",
    filled: "85",
    avgPrice: "22.41",
    status: "filled",
    fee: "0.95 USDT",
  },
  {
    id: "6",
    time: "2026-04-28 16:30",
    pair: "XRP/USDT",
    side: "buy",
    type: "limit",
    qty: "2,000",
    filled: "2,000",
    avgPrice: "0.521",
    status: "filled",
    fee: "0.52 USDT",
  },
]

type StatusFilter = "all" | OrderHistoryRow["status"]

export function OrderHistoryScreen() {
  const [pairQ, setPairQ] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [from, setFrom] = useState("2026-04-01")
  const [to, setTo] = useState("2026-05-03")

  const rows = useMemo(() => {
    return MOCK_ORDERS.filter((r) => {
      if (status !== "all" && r.status !== status) return false
      if (pairQ.trim()) {
        const q = pairQ.trim().toUpperCase()
        if (!r.pair.toUpperCase().includes(q)) return false
      }
      return true
    })
  }, [pairQ, status])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Order history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Past trades, fills, and cancellations. Connect a live exchange to sync real fills.
        </p>
      </div>

      <Card className="border-border bg-card p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
            {(["all", "filled", "partial", "cancelled"] as const).map((s) => (
              <Button
                key={s}
                type="button"
                variant={status === s ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs capitalize"
                onClick={() => setStatus(s)}
              >
                {s}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <label className="sr-only">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono"
              />
              <span className="text-muted-foreground">→</span>
              <label className="sr-only">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={pairQ}
                onChange={(e) => setPairQ(e.target.value)}
                placeholder="Filter pair…"
                className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-primary sm:w-48"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Time</th>
                <th className="px-3 py-2.5">Pair</th>
                <th className="px-3 py-2.5">Side</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Qty</th>
                <th className="px-3 py-2.5">Filled</th>
                <th className="px-3 py-2.5">Avg</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.time}</td>
                  <td className="px-3 py-2.5 font-medium">{r.pair}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-semibold uppercase",
                        r.side === "buy" ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"
                      )}
                    >
                      {r.side}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 capitalize text-muted-foreground">{r.type}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{r.qty}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{r.filled}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{r.avgPrice}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "text-xs font-semibold capitalize",
                        r.status === "filled" && "text-emerald-600",
                        r.status === "partial" && "text-amber-600",
                        r.status === "cancelled" && "text-muted-foreground line-through"
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No orders match your filters.</p>
        )}
      </Card>
    </div>
  )
}
