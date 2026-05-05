"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import type { Coin } from "@/lib/coins-data"
import { formatPrice } from "@/lib/coins-data"
import { cn } from "@/lib/utils"

type SymbolBrowserPanelProps = {
  open: boolean
  onClose: () => void
  catalog: Coin[]
  selectedSymbol: string
  onSelect: (symbol: string) => void
}

export function SymbolBrowserPanel({
  open,
  onClose,
  catalog,
  selectedSymbol,
  onSelect,
}: SymbolBrowserPanelProps) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter(
      (c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    )
  }, [catalog, query])

  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-[38] flex"
      role="dialog"
      aria-modal="true"
      aria-label="Trading pairs"
    >
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-white/[0.12] bg-[#06080c]",
          "w-[min(50vw,520px)] min-w-[260px] max-w-[min(92vw,520px)] shadow-[8px_0_48px_rgba(0,0,0,0.55)]",
          "sm:min-w-[300px]"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-white">Trading pairs</h2>
            <p className="text-[10px] text-zinc-500">USDT spot · {catalog.length} symbols</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-white/[0.06] px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol or name…"
              className="w-full rounded-lg border border-white/[0.1] bg-black/50 py-2 pl-9 pr-3 text-xs text-zinc-100 outline-none ring-0 placeholder:text-zinc-600 focus:border-cyan-500/40"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">No pairs match your search.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-2 lg:grid-cols-3">
              {filtered.map((c) => {
                const active = c.symbol === selectedSymbol
                const up = c.change24h >= 0
                return (
                  <button
                    key={c.symbol}
                    type="button"
                    onClick={() => {
                      onSelect(c.symbol)
                      onClose()
                    }}
                    className={cn(
                      "flex flex-col rounded-xl border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-cyan-500/50 bg-cyan-500/10 ring-1 ring-cyan-500/25"
                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.05]"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                        aria-hidden
                      />
                      <span className="truncate font-mono text-[11px] font-bold text-white">{c.symbol}</span>
                    </div>
                    <span className="mt-0.5 truncate text-[10px] leading-tight text-zinc-500">{c.name}</span>
                    <span className="mt-1 font-mono text-[10px] font-semibold tabular-nums text-cyan-200/90">
                      ${formatPrice(c.price)}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 font-mono text-[10px] font-medium tabular-nums",
                        up ? "text-emerald-400" : "text-rose-400"
                      )}
                    >
                      {up ? "+" : ""}
                      {c.change24h.toFixed(2)}%
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      <div
        role="presentation"
        className="min-h-0 min-w-0 flex-1 bg-black/70 backdrop-blur-[1px]"
        onClick={onClose}
      />
    </div>
  )
}
