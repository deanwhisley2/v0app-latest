"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, Lock, MessageCircle, Sparkles, Trophy, Zap } from "lucide-react"
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
import { formatSessionClock } from "@/lib/nexus-bot/trade-code"
import { cn } from "@/lib/utils"

const LEGACY_RELEASE_KEY = "nexus_bot_legacy_released_v1"

type BotTab = "signal" | "auto"

type VerifiedSession = {
  id: string
  code: string
  sessionName: string
  displayLabel: string
  sessionSlot: string
  startAt: string
  endAt: string
}

type ActiveSession = {
  id: string
  session_kind: string
  plan_key: string | null
  stake_usd: number
  strategy_title: string | null
  confidence: string | null
  ends_at: string
  status?: string
  display_phase?: string | null
  trade_sessions?: {
    start_at?: string
    end_at?: string
    session_name?: string
    code?: string
  } | null
}

type LeaderboardRow = {
  rank: number
  username: string
  points: number
  completedSessions: number
  streak: number
}

type NexusBotWorkspaceProps = {
  mainBalanceUsd?: number
  onActiveSessionCountsChange?: (counts: { copy: number; fix: number }) => void
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
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [grants, setGrants] = useState<Record<string, boolean>>({})
  const [streak, setStreak] = useState({ current: 0, longest: 0, visits: 0 })
  const [weeklyBoard, setWeeklyBoard] = useState<LeaderboardRow[]>([])
  const [myPoints, setMyPoints] = useState(0)

  const [codeInput, setCodeInput] = useState("")
  const [verifiedSession, setVerifiedSession] = useState<VerifiedSession | null>(null)
  const [verifySteps, setVerifySteps] = useState<string[]>([])
  const [verifyPhase, setVerifyPhase] = useState<string | null>(null)
  const [stakeTier, setStakeTier] = useState<number | "max">(50)
  const [activateConfirm, setActivateConfirm] = useState(false)
  const [autoPlan, setAutoPlan] = useState<string>("auto_24h")
  const [autoStake, setAutoStake] = useState("50")
  const [autoConfirm, setAutoConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const waHref = useMemo(
    () =>
      buildOperationsWhatsAppHref({
        userId: user?.id ?? "",
        email: user?.email ?? null,
      }),
    [user?.id, user?.email],
  )

  const signalCommitUsd = useMemo(() => {
    if (stakeTier === "max") return availableUsd
    return stakeTier
  }, [stakeTier, availableUsd])

  const sessionStartEnd = useMemo(() => {
    const ts = activeSession?.trade_sessions
    if (ts?.start_at && ts?.end_at) {
      return { start: ts.start_at, end: ts.end_at }
    }
    return null
  }, [activeSession])

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }
    const [botRes, perfRes] = await Promise.all([
      fetch("/api/user/nexus-bot", { headers: h, cache: "no-store" }),
      fetch("/api/user/performance", { headers: h, cache: "no-store" }),
    ])
    if (botRes.ok) {
      const j = (await botRes.json()) as {
        availableUsd?: number
        activeSessions?: ActiveSession[]
        autoTradePlans?: Array<{ key: string; granted: boolean }>
        attendance?: { current_streak?: number; longest_streak?: number; total_visits?: number }
      }
      setAvailableUsd(Number(j.availableUsd ?? mainBalanceUsd))
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
    }
    if (perfRes.ok) {
      const p = (await perfRes.json()) as {
        weeklyBoard?: LeaderboardRow[]
        myPoints?: number
      }
      setWeeklyBoard(p.weeklyBoard ?? [])
      setMyPoints(Number(p.myPoints ?? 0))
    }
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
    setAvailableUsd(mainBalanceUsd)
  }, [mainBalanceUsd])

  const verifyCode = async () => {
    setBusy(true)
    setVerifiedSession(null)
    setVerifySteps([])
    setVerifyPhase(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      setVerifySteps(["Checking code…"])
      const res = await fetch("/api/user/nexus-bot/trade-session/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.message ?? out.error ?? "Code not valid")
      setVerifySteps(out.steps ?? ["Code verified…"])
      setVerifyPhase(out.phase ?? "ready")
      if (out.session) {
        setVerifiedSession({
          id: out.session.id,
          code: out.session.code,
          sessionName: out.session.sessionName,
          displayLabel: out.session.displayLabel,
          sessionSlot: out.session.sessionSlot,
          startAt: out.session.startAt,
          endAt: out.session.endAt,
        })
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Verification failed")
      setVerifySteps([])
    } finally {
      setBusy(false)
    }
  }

  const activateTradeSession = async () => {
    if (!verifiedSession) return
    setBusy(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch("/api/user/nexus-bot/trade-session/activate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          code: verifiedSession.code,
          stakeTierUsd: stakeTier,
          confirm: activateConfirm,
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error ?? "Activation failed")
      setCodeInput("")
      setVerifiedSession(null)
      setVerifySteps([])
      setActivateConfirm(false)
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
              Join live trade sessions, stay consistent, and climb the weekly performance board.
            </p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
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
              <div className="flex justify-between rounded-lg bg-background/80 px-3 py-2">
                <span className="text-muted-foreground">Performance points</span>
                <span className="font-mono font-semibold">{myPoints}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {weeklyBoard.length > 0 ? (
        <Card className="overflow-hidden p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-warning" aria-hidden />
            <h3 className="font-semibold">Weekly performance board</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Recognition for consistency and participation — separate from your wallet balance.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2 pr-3">Rank</th>
                  <th className="pb-2 pr-3">Member</th>
                  <th className="pb-2 pr-3">Points</th>
                  <th className="pb-2 pr-3">Sessions</th>
                  <th className="pb-2">Streak</th>
                </tr>
              </thead>
              <tbody>
                {weeklyBoard.map((row) => (
                  <tr key={row.rank} className="border-b border-border/30 last:border-0">
                    <td className="py-2 pr-3 font-mono">#{row.rank}</td>
                    <td className="py-2 pr-3">{row.username}</td>
                    <td className="py-2 pr-3 font-mono font-semibold">{row.points}</td>
                    <td className="py-2 pr-3 font-mono">{row.completedSessions}</td>
                    <td className="py-2 font-mono">{row.streak}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {activeSession ? (
        <Card className="overflow-hidden border-success/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-success">
              {activeSession.display_phase ?? "Trade active"}
            </p>
            {sessionStartEnd ? (
              <p className="font-mono text-xs text-muted-foreground">
                {formatSessionClock(sessionStartEnd.start)} – {formatSessionClock(sessionStartEnd.end)}
              </p>
            ) : null}
          </div>
          <p className="text-sm font-medium">{activeSession.strategy_title}</p>
          <p className="text-xs text-muted-foreground">
            Stake {formatUserMoney(Number(activeSession.stake_usd))}
          </p>
          <div className="mt-4">
            <FixedTradeSimulation sessionId={activeSession.id} deskSalt={activeSession.id} />
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
          Trade Code
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
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Paste today&apos;s trade code
          </p>
          <Input
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value.toUpperCase())
              setVerifiedSession(null)
              setVerifySteps([])
            }}
            placeholder="NXP-7A82-X91K"
            className="font-mono uppercase"
            disabled={Boolean(activeSession)}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={busy || Boolean(activeSession) || !codeInput.trim()}
            onClick={() => void verifyCode()}
          >
            Verify code
          </Button>
          {verifySteps.length > 0 ? (
            <ul className="space-y-1 rounded-lg bg-muted/30 p-3 text-sm">
              {verifySteps.map((step) => (
                <li key={step} className="text-muted-foreground">
                  {step}
                </li>
              ))}
            </ul>
          ) : null}
          {verifiedSession ? (
            <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm space-y-1">
              <p className="font-medium">{verifiedSession.displayLabel}</p>
              <p className="text-muted-foreground">
                {formatSessionClock(verifiedSession.startAt)} – {formatSessionClock(verifiedSession.endAt)}
              </p>
              {verifyPhase === "pending" ? (
                <p className="text-xs text-warning">Waiting for session start</p>
              ) : (
                <p className="text-xs text-success">Preparing trade session…</p>
              )}
            </div>
          ) : null}
          {verifiedSession && !activeSession ? (
            <>
              <p className="text-sm text-muted-foreground">Select capital (USD commit)</p>
              <div className="flex flex-wrap gap-2">
                {NEXUS_SIGNAL_STAKE_TIERS_USD.map((usd) => (
                  <button
                    key={usd}
                    type="button"
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
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={activateConfirm}
                  onCheckedChange={(v) => setActivateConfirm(v === true)}
                />
                <span>
                  By activating Nexus Bot you authorize the platform strategy engine to manage the selected
                  capital during the session period. The system may enter and exit positions automatically
                  according to session strategy. Only profits become available for release. Capital remains
                  governed by the session rules.
                </span>
              </label>
              <Button
                className="w-full min-h-[48px]"
                disabled={busy || !activateConfirm || verifyPhase === "expired"}
                onClick={() => void activateTradeSession()}
              >
                Activate Nexus Bot
              </Button>
            </>
          ) : null}
        </Card>
      ) : (
        <Card className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">
            AUTO MODE — Automatically executes Nexus-approved strategy sessions during the selected period.
            Administrator approval required for each plan.
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
