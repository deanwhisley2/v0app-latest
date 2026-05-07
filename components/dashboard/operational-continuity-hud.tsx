"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Cpu,
  GitBranch,
  Landmark,
  Layers,
  Radio,
  Shield,
  Wallet,
  Zap,
} from "lucide-react"
import { useOperationalBootstrap } from "@/contexts/OperationalBootstrapContext"

/** Infrastructure heartbeat — bootstrap snapshot + `/api/health` + `/api/health/supabase`. */
export function OperationalContinuityHud({ className }: { className?: string }) {
  const { snapshot, isLoading, error, refetch } = useOperationalBootstrap()
  const [healthOk, setHealthOk] = useState<boolean | null>(null)
  const [healthAt, setHealthAt] = useState<number | null>(null)
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null)
  const [grokLive, setGrokLive] = useState<boolean | null>(null)
  const [grokHint, setGrokHint] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const ping = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" })
        if (!alive) return
        setHealthOk(r.ok)
        setHealthAt(Date.now())
      } catch {
        if (!alive) return
        setHealthOk(false)
        setHealthAt(Date.now())
      }
      try {
        const r = await fetch("/api/health/supabase", { cache: "no-store" })
        if (!alive) return
        let ok = false
        if (r.ok) {
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean }
          ok = j.ok === true
        }
        setSupabaseOk(ok)
      } catch {
        if (!alive) return
        setSupabaseOk(false)
      }
    }
    void ping()
    const id = window.setInterval(ping, 45_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const loadGrok = async () => {
      try {
        const r = await fetch("/api/grok/status", { cache: "no-store" })
        if (!alive) return
        if (!r.ok) {
          setGrokLive(false)
          setGrokHint("status unavailable")
          return
        }
        const j = (await r.json()) as {
          pipelineLive?: boolean
          frozenReason?: string | null
        }
        setGrokLive(j.pipelineLive === true)
        setGrokHint(typeof j.frozenReason === "string" && j.frozenReason ? j.frozenReason : null)
      } catch {
        if (alive) {
          setGrokLive(false)
          setGrokHint(null)
        }
      }
    }
    void loadGrok()
    const id = window.setInterval(loadGrok, 120_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  const summaries = useMemo(() => {
    const c = snapshot?.continuity
    if (!c) {
      return {
        sessions: 0,
        positions: 0,
        executions: 0,
        simulations: 0,
        daemon: 0,
        focusLease: false,
        recoIssues: 0,
        telemetryRows: snapshot?.recentAnalysis?.length ?? 0,
      }
    }

    const sessions = Array.isArray(c.activeSessions) ? c.activeSessions.length : 0
    const positions = Array.isArray(c.positionState) ? c.positionState.length : 0
    const executions = Array.isArray(c.executionState) ? c.executionState.length : 0
    const simulations = Array.isArray(c.simulationState) ? c.simulationState.length : 0
    const daemonRows = Array.isArray(c.daemonSymbolState) ? c.daemonSymbolState : []

    let recoIssues = 0
    for (const row of Array.isArray(c.executionState) ? c.executionState : []) {
      const r = row as { reconciliationStatus?: string; lastError?: string | null }
      if (
        String(r?.reconciliationStatus ?? "").includes("FAILED") ||
        String(r?.reconciliationStatus ?? "").includes("STALE") ||
        (typeof r.lastError === "string" && r.lastError.length > 0)
      )
        recoIssues++
    }

    const leases = Array.isArray(c.leases) ? c.leases : []
    const focusLease = leases.some((l: unknown) => {
      const o = l as { leaseKey?: string }
      return typeof o?.leaseKey === "string" && o.leaseKey.includes("focus-20-observer")
    })

    return {
      sessions,
      positions,
      executions,
      simulations,
      daemon: daemonRows.length,
      focusLease,
      recoIssues,
      telemetryRows: snapshot?.recentAnalysis?.length ?? 0,
    }
  }, [snapshot])

  const exch = snapshot?.exchangeConnections?.length ?? 0
  const profileUsd =
    snapshot?.exchangeBalancesSnapshot &&
    typeof snapshot.exchangeBalancesSnapshot.totalUsd === "number"
      ? snapshot.exchangeBalancesSnapshot.totalUsd
      : null
  const gate = snapshot?.resumeGate?.status ?? "—"
  const govMode = snapshot?.governance?.mode ?? "—"
  const govHealth = snapshot?.governance?.healthState ?? "—"

  return (
    <details className={className ?? "rounded-xl border border-border/80 bg-card/95 text-card-foreground"}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/30">
        <span className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          Operational heartbeat
          {isLoading && <span className="text-[10px] normal-case text-amber-500">sync…</span>}
          {error && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60 [[open]_&]:rotate-180 motion-safe:transition-transform" aria-hidden />
      </summary>
      <div className="border-t border-border/60 px-3 py-2 text-[11px] leading-snug space-y-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          <Metric icon={<Layers className="h-3 w-3" />} label="Active sessions" value={String(summaries.sessions)} />
          <Metric icon={<GitBranch className="h-3 w-3" />} label="Positions" value={String(summaries.positions)} />
          <Metric icon={<Zap className="h-3 w-3" />} label="Execution rows" value={String(summaries.executions)} />
          <Metric icon={<Cpu className="h-3 w-3" />} label="Daemon runtime" value={String(summaries.daemon)} />
          <Metric icon={<Wallet className="h-3 w-3" />} label="Exchanges wired" value={String(exch)} />
          <Metric
            icon={<Landmark className="h-3 w-3" />}
            label="Profile exch. USD"
            value={profileUsd !== null ? `$${profileUsd.toFixed(2)}` : "—"}
          />
          <Metric icon={<Shield className="h-3 w-3" />} label="Resume gate" value={gate} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
          <span>
            Governance <span className="text-foreground">{govMode}</span> /{" "}
            <span className="text-foreground">{govHealth}</span>
          </span>
          <span>
            Sim rows <span className="text-foreground">{summaries.simulations}</span>
          </span>
          <span>
            Telemetry (analysis){" "}
            <span className="text-foreground">{summaries.telemetryRows}</span>
          </span>
          <span>
            Reconciliation alerts{" "}
            <span className={summaries.recoIssues > 0 ? "text-amber-500" : "text-foreground"}>
              {summaries.recoIssues}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Radio className="h-3 w-3" />
            Focus observer lease{" "}
            <span className="text-foreground">{summaries.focusLease ? "held" : "none"}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
          <div className="flex flex-wrap gap-3">
            <span>
              Bootstrap <span className="font-mono text-foreground">{snapshot?.restoredAt ?? "—"}</span>
            </span>
            <span className="flex items-center gap-1">
              App health
              <span className={healthOk ? "text-emerald-400" : healthOk === false ? "text-amber-500" : ""}>
                {healthOk === null ? "…" : healthOk ? "OK" : "down"}
              </span>
              {healthAt ? (
                <span className="text-muted-foreground">({new Date(healthAt).toLocaleTimeString()})</span>
              ) : null}
            </span>
            <span className="flex items-center gap-1">
              Postgres (service)
              <span
                className={
                  supabaseOk ? "text-emerald-400" : supabaseOk === false ? "text-amber-500" : ""
                }
              >
                {supabaseOk === null ? "…" : supabaseOk ? "OK" : "down"}
              </span>
            </span>
            <span className={typeof navigator !== "undefined" && navigator.onLine ? "" : "text-amber-500"}>
              Browser online: {typeof navigator !== "undefined" ? (navigator.onLine ? "yes" : "offline") : "—"}
            </span>
            <span
              className="max-w-[min(28rem,85vw)]"
              title={grokHint ?? undefined}
            >
              Grok narrative:{" "}
              <span
                className={
                  grokLive ? "text-emerald-400" : grokLive === false ? "text-muted-foreground" : ""
                }
              >
                {grokLive === null ? "…" : grokLive ? "live" : "frozen"}
              </span>
            </span>
          </div>
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted/40"
            onClick={() => void refetch()}
          >
            Refresh snapshot
          </button>
        </div>
      </div>
    </details>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
        <div className="font-mono text-sm text-foreground">{value}</div>
      </div>
    </div>
  )
}
