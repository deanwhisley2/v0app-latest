"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, Loader2, Search } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type RetailerRow = {
  id: string
  userId: string
  email: string | null
  countryCode: string | null
  displayStatus: string
  retailBalanceUsd: number
  spendableLiquidityUsd: number
  creditBasinUsd: number
  underReview: boolean
  lowFloatAlert: boolean
  operationalFrozen: boolean
  accountDisabled: boolean
  lastActivityAt: string | null
}

export function AdminResellersPanel() {
  const { user } = useAuth()
  const [rows, setRows] = useState<RetailerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<RetailerRow | null>(null)
  const [acting, setActing] = useState(false)

  const authHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return null
    return { Authorization: `Bearer ${token}` } as HeadersInit
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const h = await authHeaders()
      if (!h) throw new Error("Sign in as Level 5 admin.")
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""
      const res = await fetch(`/api/admin/retailers${qs}`, { headers: h, cache: "no-store" })
      const j = (await res.json()) as { retailers?: RetailerRow[]; error?: string }
      if (!res.ok) throw new Error(j.error ?? "Failed to load resellers")
      setRows(j.retailers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [authHeaders, q])

  useEffect(() => {
    if (!user) return
    void load()
  }, [user, load])

  const filtered = useMemo(() => rows, [rows])

  const runAction = async (action: "freeze" | "block" | "suspend" | "activate") => {
    if (!selected) return
    setActing(true)
    try {
      const h = await authHeaders()
      if (!h) throw new Error("Session expired")
      const res = await fetch("/api/admin/retailers", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ retailerProfileId: selected.id, action }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? "Action failed")
      await load()
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              displayStatus:
                action === "activate"
                  ? "Active"
                  : action === "freeze"
                    ? "Frozen"
                    : action === "suspend"
                      ? "Suspended"
                      : "Blocked",
            }
          : null,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed")
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
              <Building2 className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Reseller management</h1>
              <p className="text-sm text-muted-foreground">Active country retailers · Level 5 admin</p>
            </div>
          </div>
          <div className="flex w-full max-w-sm items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search email or id…"
                className="pl-9"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              Search
            </Button>
          </div>
        </header>

        {error ? (
          <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No resellers found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Spendable</th>
                    <th className="px-4 py-3 font-medium">Country</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/30",
                        selected?.id === r.id && "bg-primary/5",
                      )}
                      onClick={() => setSelected(r)}
                    >
                      <td className="max-w-[200px] truncate px-4 py-3 font-medium">{r.email ?? r.userId.slice(0, 8)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            r.displayStatus === "Active"
                              ? "bg-success/15 text-success"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {r.displayStatus}
                        </span>
                        {r.lowFloatAlert ? (
                          <span className="ml-1 text-[10px] text-warning">Low float</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">${r.spendableLiquidityUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.countryCode ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <aside className="w-full shrink-0 rounded-xl border border-border bg-card p-4 lg:w-80">
          <h2 className="text-sm font-semibold text-foreground">Reseller details</h2>
          <dl className="mt-3 space-y-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium break-all">{selected.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Profile id</dt>
              <dd className="font-mono break-all">{selected.id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Retail balance</dt>
              <dd className="font-mono">${selected.retailBalanceUsd.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Credit basin</dt>
              <dd className="font-mono">${selected.creditBasinUsd.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Under review</dt>
              <dd>{selected.underReview ? "Yes" : "No"}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-col gap-2">
            <Button type="button" size="sm" disabled={acting} onClick={() => void runAction("activate")}>
              Activate
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={acting} onClick={() => void runAction("freeze")}>
              Freeze
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={acting} onClick={() => void runAction("block")}>
              Block
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={acting}
              onClick={() => void runAction("suspend")}
            >
              Suspend
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Close panel
            </Button>
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Trading activity and advanced controls remain in the operational desk on the main dashboard.
          </p>
        </aside>
      ) : null}
    </div>
  )
}
