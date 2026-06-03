"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, Lock, MessageCircle, Sparkles, Zap } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { FixedTradeSimulation } from "@/components/dashboard/fixed-trade-simulation"
import { NEXUS_AUTO_TRADE_PLANS, NEXUS_SIGNAL_STAKE_TIERS_USD } from "@/lib/nexus-bot/plans"
import { buildOperationsWhatsAppHref } from "@/lib/nexus-operations-whatsapp"
import { cn } from "@/lib/utils"

const LEGACY_RELEASE_KEY = "nexus_bot_legacy_released_v1"

type BotTab = "signal" | "auto"

type OpenSignal = {
  id: string
  slot: string
  code: string
  strategyTitle: string
  confidence: string
  durationHours: number
  windowClosesAt: string
}

type ActiveSession = {
  id: string
  session_kind: string
  plan_key: string | null
  stake_usd: number
  strategy_title: string | null
  confidence: string | null
  ends_at: string
}

type NexusBotWorkspaceProps = {
  mainBalanceUsd?: number
  onActiveSessionCountsChange?: (counts: { copy: number; fix: number }) => void
}

function formatCountdown(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return "Completing…"
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d}d ${h % 24}h remaining`
  }
  return `${h}h ${m}m remaining`
}

export function NexusBotWorkspace({
  mainBalanceUsd = 0,
  onActiveSessionCountsChange,
}: NexusBotWorkspaceProps) {
  const { user } = useAuth()
  const { formatUserMoney } = useUserPreferences()
  const [tab, setTab] = useState<BotTab>("signal")
  const [loading, setLoading] = useState(true)
  const [availableUsd, setAvailableUsd] = useState(mainBalanceUsd)
  const [openSignals, setOpenSignals] = useState<OpenSignal[]>([])
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [grants, setGrants] = useState<Record<string, boolean>>({})
  const [streak, setStreak] = useState({ current: 0, longest: 0, visits: 0 })

  const [codeInput, setCodeInput] = useState("")
  const [signalSlot, setSignalSlot] = useState<"morning" | "evening">("morning")
  const [stakeTier, setStakeTier] = useState<number | "max">(50)
  const [autoPlan, setAutoPlan] = useState<string>("auto_24h")
  const [autoStake, setAutoStake] = useState("50")
  const [autoConfirm, setAutoConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  const waHref = useMemo(
    () =>
      buildOperationsWhatsAppHref({
        userId: user?.id ?? "",
        email: user?.email ?? null,
      }),
    [user?.id, user?.email],
  )

  const selectedSignal = useMemo(
    () => openSignals.find((s) => s.slot === signalSlot) ?? openSignals[0] ?? null,
    [openSignals, signalSlot],
  )

  const signalCommitUsd = useMemo(() => {
    if (stakeTier === "max") return availableUsd
    return stakeTier
  }, [stakeTier, availableUsd])

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }
    const res = await fetch("/api/user/nexus-bot", { headers: h, cache: "no-store" })
    if (!res.ok) return
    const j = (await res.json()) as {
      availableUsd?: number
      openSignals?: OpenSignal[]
      activeSessions?: ActiveSession[]
      autoTradePlans?: Array<{ key: string; granted: boolean }>
      attendance?: { current_streak?: number; longest_streak?: number; total_visits?: number }
    }
    setAvailableUsd(Number(j.availableUsd ?? mainBalanceUsd))
    setOpenSignals(j.openSignals ?? [])
    const active = (j.activeSessions ?? [])[0] ?? null
    setActiveSession(active)
    const g: Record<string, boolean> = {}
    for (const p of j.autoTradePlans ?? []) g[p.key] = Boolean(p.granted)
    setGrants(g)
    const att = j.attendance ?? {}
    setStreak({
      current: Number(att.current_streak ?? 0),
      longest: Number(att.longest_streak ?? 0),
      visits: Number(att.total_visits ?? 0),
    })
    onActiveSessionCountsChange?.({ copy: 0, fix: active ? 1 : 0 })
  }, [mainBalanceUsd, onActiveSessionCountsChange])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (token) {
          let released = false
          try {
            released = sessionStorage.getItem(LEGACY_RELEASE_KEY) === "1"
          } catch {
            /* ignore */
          }
          if (!released) {
            await fetch("/api/user/nexus-bot", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ action: "release_legacy_container" }),
            })
            try {
              sessionStorage.setItem(LEGACY_RELEASE_KEY, "1")
            } catch {
              /* ignore */
            }
          }
        }
        await load()
      } finally {
        setLoading(false)
      }
    })()
  }, [load])

  useEffect(() => {
    if (!activeSession) return
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [activeSession])

  useEffect(() => {
    setAvailableUsd(mainBalanceUsd)
  }, [mainBalanceUsd])

  const activateSignal = async () => {
    setBusy(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch("/api/user/nexus-bot/signal/activate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ slot: signalSlot, code: codeInput, stakeTierUsd: stakeTier }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error ?? "Activation failed")
      setCodeInput("")
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Activation failed")
    } finally {
      setBusy(false)
    }
  }

  const activateAuto = async () => {
    setBusy(true)
    try {
      const stake = Number(autoStake)
      if (!(stake > 0)) throw new Error("Enter a valid USD stake amount.")
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch("/api/user/nexus-bot/auto-trade/activate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: autoPlan, stakeUsd: stake, confirm: true }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error ?? "Activation failed")
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Activation failed")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        Loading Nexus Bot…
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      <Card className="border-primary/25 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Bot className="h-8 w-8 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Nexus Bot</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Signal sessions and Auto Trade — community-driven engagement with governed operations approval.
            </p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between rounded-lg bg-background/80 px-3 py-2">
                <span className="text-muted-foreground">Available (USD)</span>
                <span className="font-mono font-semibold">{formatUserMoney(availableUsd)}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-background/80 px-3 py-2">
                <span className="text-muted-foreground">Visit streak</span>
                <span className="font-mono font-semibold">
                  {streak.current} day{streak.current === 1 ? "" : "s"} · best {streak.longest}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {activeSession ? (
        <Card className="overflow-hidden border-success/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-success">
              {activeSession.session_kind === "auto" ? "AUTO ACTIVE" : "SIGNAL ACTIVE"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {tick >= 0 ? formatCountdown(activeSession.ends_at) : null}
            </p>
          </div>
          <p className="text-sm font-medium">{activeSession.strategy_title}</p>
          <p className="text-xs text-muted-foreground">
            Stake {formatUserMoney(Number(activeSession.stake_usd))} · Confidence{" "}
            {activeSession.confidence ?? "—"}
          </p>
          <div className="mt-4">
            <FixedTradeSimulation sessionId={activeSession.id} seedKey={activeSession.id} />
          </div>
        </Card>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("signal")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold",
            tab === "signal" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Sparkles className="h-4 w-4" />
          Signal Code
        </button>
        <button
          type="button"
          onClick={() => setTab("auto")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold",
            tab === "auto" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Zap className="h-4 w-4" />
          Auto Trade
        </button>
      </div>

      {tab === "signal" ? (
        <Card className="space-y-4 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Signal code panel</p>
          <div className="flex gap-2">
            {(["morning", "evening"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSignalSlot(s)}
                className={cn(
                  "flex-1 rounded-lg py-2 text-sm font-medium capitalize",
                  signalSlot === s ? "bg-warning/20 text-warning" : "bg-muted",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          {selectedSignal ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Code:</span>{" "}
                <span className="font-mono font-bold">{selectedSignal.code}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Strategy:</span> {selectedSignal.strategyTitle}
              </p>
              <p>
                <span className="text-muted-foreground">Confidence:</span> {selectedSignal.confidence}
              </p>
              <p>
                <span className="text-muted-foreground">Duration:</span> {selectedSignal.durationHours} hours
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active {signalSlot} code published yet. Check WhatsApp for today&apos;s Nexus code.</p>
          )}
          <Input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="Enter Nexus code"
            className="font-mono uppercase"
            disabled={Boolean(activeSession)}
          />
          <p className="text-sm text-muted-foreground">Choose stake (USD commit)</p>
          <div className="flex flex-wrap gap-2">
            {NEXUS_SIGNAL_STAKE_TIERS_USD.map((usd) => (
              <button
                key={usd}
                type="button"
                disabled={Boolean(activeSession)}
                onClick={() => setStakeTier(usd)}
                className={cn(
                  "rounded-lg px-4 py-2 font-mono text-sm font-semibold",
                  stakeTier === usd ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                ${usd}
              </button>
            ))}
            <button
              type="button"
              disabled={Boolean(activeSession)}
              onClick={() => setStakeTier("max")}
              className={cn(
                "rounded-lg px-4 py-2 font-mono text-sm font-semibold",
                stakeTier === "max" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              Max
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Trade commit:{" "}
            <span className="font-mono font-semibold text-foreground">
              {formatUserMoney(signalCommitUsd)}
            </span>
          </p>
          <Button
            className="w-full min-h-[48px]"
            disabled={busy || Boolean(activeSession) || !codeInput.trim()}
            onClick={() => void activateSignal()}
          >
            Activate Session
          </Button>
        </Card>
      ) : (
        <Card className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">
            AUTO MODE — Automatically executes Nexus-approved strategy sessions during the selected period. Administrator approval required for each plan.
          </p>
          <div className="space-y-3">
            {NEXUS_AUTO_TRADE_PLANS.map((plan) => {
              const unlocked = Boolean(grants[plan.key])
              return (
                <div
                  key={plan.key}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-4 py-3",
                    unlocked ? "border-primary/30" : "border-border/60 opacity-90",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {unlocked ? (
                      <Zap className="h-4 w-4 text-primary" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{plan.label}</span>
                  </div>
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {unlocked ? "Available" : "Locked"}
                  </span>
                </div>
              )
            })}
          </div>
          {grants[autoPlan] ? (
            <>
              <label className="text-sm font-medium">Stake amount (USD)</label>
              <Input
                value={autoStake}
                onChange={(e) => setAutoStake(e.target.value.replace(/[^\d.]/g, ""))}
                className="font-mono"
                disabled={Boolean(activeSession)}
              />
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={autoConfirm}
                  onCheckedChange={(v) => setAutoConfirm(v === true)}
                  disabled={Boolean(activeSession)}
                />
                <span>I confirm Auto Trade activation for the selected plan. Funds remain in my USD ledger.</span>
              </label>
              <Button
                className="w-full min-h-[48px]"
                disabled={busy || Boolean(activeSession) || !autoConfirm}
                onClick={() => void activateAuto()}
              >
                Activate Auto Session
              </Button>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm">
              <p className="font-medium">Administrator approval required</p>
              <p className="mt-1 text-muted-foreground">Contact Operations to unlock Auto Trade plans.</p>
              <Button variant="outline" className="mt-3 w-full gap-2" asChild>
                <a href={waHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  Request Auto Trade Access
                </a>
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {NEXUS_AUTO_TRADE_PLANS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setAutoPlan(p.key)}
                className={cn(
                  "rounded-lg py-2 text-xs font-medium",
                  autoPlan === p.key ? "bg-muted ring-2 ring-primary/40" : "bg-muted/50",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
