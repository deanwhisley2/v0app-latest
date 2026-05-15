"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeftRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabaseClient"

type PoolSnapshot = {
  usd: number
  usdFormatted: string
  label: string
}

type PoolsResponse = {
  pools?: {
    MAIN_TREASURY?: PoolSnapshot
    OPERATIONAL?: PoolSnapshot
  }
}

type TransferMode = "fund_approvals" | "move_to_reserve"

export function TreasuryPoolsPanel({
  showBalance,
  formatUsd,
}: {
  showBalance: boolean
  formatUsd: (n: number) => string
}) {
  const [autoPool, setAutoPool] = useState<PoolSnapshot | null>(null)
  const [reservePool, setReservePool] = useState<PoolSnapshot | null>(null)
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState<TransferMode>("fund_approvals")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPools = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch("/api/admin/treasury", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!res.ok) return
      const j = (await res.json()) as PoolsResponse
      setAutoPool(j.pools?.MAIN_TREASURY ?? null)
      setReservePool(j.pools?.OPERATIONAL ?? null)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void loadPools()
    const id = window.setInterval(() => void loadPools(), 45_000)
    return () => window.clearInterval(id)
  }, [loadPools])

  const runTransfer = async () => {
    setError(null)
    setMessage(null)
    const amt = parseFloat(amount)
    if (!(amt > 0)) {
      setError("Enter an amount greater than zero.")
      return
    }
    setBusy(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Sign in again.")

      const fromPool = mode === "fund_approvals" ? "OPERATIONAL" : "MAIN_TREASURY"
      const toPool = mode === "fund_approvals" ? "MAIN_TREASURY" : "OPERATIONAL"

      const res = await fetch("/api/admin/treasury/transfer", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fromPool, toPool, amountUsd: amt }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
      if (!res.ok || !j.ok) throw new Error(j.error || "Transfer failed.")

      setAmount("")
      setMessage(
        mode === "fund_approvals"
          ? "Moved to auto-approval float. Customer credits and approvals will use this pool."
          : "Moved to treasury reserve. Auto-approval float is leaner now.",
      )
      await loadPools()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed.")
    } finally {
      setBusy(false)
    }
  }

  const mask = (p: PoolSnapshot | null) =>
    !showBalance ? "••••••" : p?.usdFormatted || (p != null ? formatUsd(p.usd) : "…")

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Move funds between treasury pools</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Keep auto-approval float lean; hold bulk liquidity in reserve. Transfers are instant and
            ledgered.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Auto-approval float</p>
          <p className="font-mono text-lg font-bold text-primary">{mask(autoPool)}</p>
          <p className="text-[10px] text-muted-foreground">MAIN_TREASURY · crypto credits &amp; approvals</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Treasury reserve</p>
          <p className="font-mono text-lg font-bold">{mask(reservePool)}</p>
          <p className="text-[10px] text-muted-foreground">OPERATIONAL · bulk company liquidity</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("fund_approvals")
            setError(null)
            setMessage(null)
          }}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "fund_approvals"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          Fund approvals (reserve → auto)
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("move_to_reserve")
            setError(null)
            setMessage(null)
          }}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "move_to_reserve"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          Move to reserve (auto → reserve)
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-[11px] text-muted-foreground">Amount (USD)</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            className="font-mono"
          />
        </div>
        <Button type="button" onClick={() => void runTransfer()} disabled={busy} className="shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Transfer"}
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p> : null}
    </div>
  )
}
