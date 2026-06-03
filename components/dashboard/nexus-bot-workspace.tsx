"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, CheckCircle2, Lock, MessageCircle, Sparkles, Trophy, Zap } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { FixedTradeSimulation } from "@/components/dashboard/fixed-trade-simulation"
import { TradeSessionProfitCelebration } from "@/components/dashboard/trade-session-profit-celebration"
import { NEXUS_AUTO_TRADE_PLANS, NEXUS_SIGNAL_STAKE_TIERS_USD } from "@/lib/nexus-bot/plans"
import { buildOperationsWhatsAppHref } from "@/lib/nexus-operations-whatsapp"
import { VERIFY_STEPS_USER } from "@/lib/nexus-bot/user-session-messaging"
import { cn } from "@/lib/utils"

const LEGACY_RELEASE_KEY = "nexus_bot_legacy_released_v1"
const SIGNAL_GROUP_HREF = "https://chat.whatsapp.com/GH3tSCYOQf8C4UldGDBLBf"

type BotTab = "signal" | "auto"
type FlowStep = 1 | 2 | 3 | 4 | 5

type VerifiedSession = {
  verificationId: string
  verifiedAt: string
}

type ActiveSession = {
  id: string
  session_kind: string
  stake_usd: number
  status?: string
  phaseKey?: string
  headline?: string
  detail?: string
  projected_profit_usd?: number
  earnings_withdrawable?: boolean
}

type LeaderboardRow = {
  rank: number
  username: string
  points: number
  completedSessions: number
  streak: number
}

type ProfitCelebration = {
  sessionId: string
  profitUsd: number
  summary: string
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
  const [celebration, setCelebration] = useState<ProfitCelebration | null>(null)

  const [codeInput, setCodeInput] = useState("")
  const [flowStep, setFlowStep] = useState<FlowStep>(1)
  const [verifiedSession, setVerifiedSession] = useState<VerifiedSession | null>(null)
  const [verifySteps, setVerifySteps] = useState<string[]>([])
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [activateError, setActivateError] = useState<string | null>(null)
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

  const resetFlow = useCallback(() => {
    setFlowStep(1)
    setVerifiedSession(null)
    setVerifySteps([])
    setVerifyError(null)
    setActivateError(null)
    setActivateConfirm(false)
  }, [])

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
        pendingProfitCelebration?: ProfitCelebration | null
      }
      setAvailableUsd(Number(j.availableUsd ?? mainBalanceUsd))
      const active = (j.activeSessions ?? [])[0] ?? null
      setActiveSession(active)
      if (active) setFlowStep(5)
      else resetFlow()
      const g: Record<string, boolean> = {}
      for (const p of j.autoTradePlans ?? []) g[p.key] = Boolean(p.granted)
      setGrants(g)
      const att = j.attendance ?? {}
      setStreak({
        current: Number(att.current_streak ?? 0),
        longest: Number(att.longest_streak ?? 0),
        visits: Number(att.total_visits ?? 0),
      })
      if (j.pendingProfitCelebration?.sessionId) {
        setCelebration(j.pendingProfitCelebration)
      }
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
  }, [mainBalanceUsd, onActiveSessionCountsChange, resetFlow])

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
    const id = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(id)
  }, [activeSession, load])

  useEffect(() => {
    setAvailableUsd(mainBalanceUsd)
  }, [mainBalanceUsd])

  const dismissCelebration = useCallback(async () => {
    if (!celebration) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (token) {
      await fetch("/api/user/nexus-bot", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "ack_profit_celebration",
          sessionId: celebration.sessionId,
        }),
      })
    }
    setCelebration(null)
  }, [celebration])

  const verifyCode = async () => {
    setBusy(true)
    setVerifyError(null)
    setVerifiedSession(null)
    setVerifySteps(["Verifying trade code"])
    setActivateError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch("/api/user/nexus-bot/trade-session/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error ?? "Verification failed")
      setVerifySteps(out.steps ?? [...VERIFY_STEPS_USER])
      setVerifiedSession({
        verificationId: out.verificationId,
        verifiedAt: out.verifiedAt,
      })
      setFlowStep(3)
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Verification failed")
      setVerifySteps([])
      setFlowStep(1)
    } finally {
      setBusy(false)
    }
  }

  const activateTradeSession = async () => {
    if (!verifiedSession) return
    setBusy(true)
    setActivateError(null)
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
          code: codeInput,
          verificationId: verifiedSession.verificationId,
          stakeTierUsd: stakeTier,
          confirm: activateConfirm,
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error ?? "Activation failed")
      setCodeInput("")
      resetFlow()
      setFlowStep(5)
      await load()
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : "Activation failed")
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
      {celebration ? (
        <TradeSessionProfitCelebration
          profitUsd={celebration.profitUsd}
          summary={celebration.summary}
          formatMoney={formatUserMoney}
          onDismiss={() => void dismissCelebration()}
        />
      ) : null}

      <Card className="border-primary/25 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Bot className="h-8 w-8 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Nexus Bot</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verify today&apos;s code, allocate capital, and join the live trade session queue.
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
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-success">
                {activeSession.headline ?? "Trade Session Active"}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeSession.detail ?? "Nexus Bot analysing market conditions"}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Allocation {formatUserMoney(Number(activeSession.stake_usd))}
          </p>
          {Number(activeSession.projected_profit_usd ?? 0) > 0 &&
          !activeSession.earnings_withdrawable ? (
            <p className="mt-2 text-sm">
              Session earnings{" "}
              <span className="font-mono font-semibold text-success">
                +{formatUserMoney(Number(activeSession.projected_profit_usd))}
              </span>
              <span className="block text-xs text-muted-foreground">
                Visible during session · released to available balance when the session completes
              </span>
            </p>
          ) : null}
          {activeSession.status === "booked" || activeSession.status === "ready" ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-warning">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Trade booked successfully · Waiting for session start
            </p>
          ) : null}
          {!["booked", "ready", "pending"].includes(activeSession.status ?? "") ? (
            <div className="mt-4">
              <FixedTradeSimulation sessionId={activeSession.id} deskSalt={activeSession.id} />
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("signal")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold touch-manipulation",
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
            "flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold touch-manipulation",
            tab === "auto" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Zap className="h-4 w-4" />
          Auto Trade
        </button>
      </div>

      {tab === "signal" ? (
        <Card className="space-y-4 p-4">
          {!activeSession ? (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                {([1, 2, 3, 4] as const).map((n) => (
                  <span
                    key={n}
                    className={cn(
                      "rounded-full px-3 py-1 font-medium",
                      flowStep >= n || (n === 4 && flowStep >= 3)
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {n === 1 ? "Paste code" : n === 2 ? "Verify" : n === 3 ? "Capital" : "Activate"}
                  </span>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Step 1 · Paste code
                </p>
                <Input
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value.toUpperCase())
                    resetFlow()
                    setFlowStep(1)
                  }}
                  placeholder="NXP-7A82-X91K"
                  className="min-h-[48px] font-mono uppercase"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Step 2 · Verify code
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[48px] w-full touch-manipulation"
                  disabled={busy || !codeInput.trim()}
                  onClick={() => void verifyCode()}
                >
                  {busy && flowStep < 3 ? "Verifying…" : "Verify code"}
                </Button>
                {verifyError ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {verifyError}
                  </p>
                ) : null}
                {verifySteps.length > 0 ? (
                  <ul className="space-y-1 rounded-lg bg-muted/30 p-3 text-sm">
                    {verifySteps.map((step) => (
                      <li key={step} className="flex items-center gap-2 text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                        {step}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {verifiedSession && flowStep >= 3 ? (
                <>
                  <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
                    <p className="font-semibold text-success">Code verified</p>
                    <p className="text-muted-foreground">Select capital, then activate Nexus Bot to book your trade.</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Step 3 · Select capital
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {NEXUS_SIGNAL_STAKE_TIERS_USD.map((usd) => (
                        <button
                          key={usd}
                          type="button"
                          onClick={() => setStakeTier(usd)}
                          className={cn(
                            "min-h-[44px] rounded-lg px-4 py-2 font-mono text-sm font-semibold touch-manipulation",
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
                          "min-h-[44px] rounded-lg px-4 py-2 font-mono text-sm font-semibold touch-manipulation",
                          stakeTier === "max" ? "bg-primary text-primary-foreground" : "bg-muted",
                        )}
                      >
                        Max
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Allocation preview:{" "}
                      <span className="font-mono font-semibold text-foreground">
                        {formatUserMoney(signalCommitUsd)}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Step 4 · Activate Nexus Bot
                    </p>
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={activateConfirm}
                        onCheckedChange={(v) => setActivateConfirm(v === true)}
                      />
                      <span>
                        I authorize Nexus Bot to manage the selected capital for this session. Only
                        session profits become available for release when the window closes.
                      </span>
                    </label>
                    {activateError ? (
                      <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {activateError}
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      className="min-h-[52px] w-full touch-manipulation text-base font-semibold"
                      disabled={busy || !activateConfirm}
                      onClick={() => void activateTradeSession()}
                    >
                      {busy ? "Booking trade…" : "Activate Nexus Bot"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 min-h-[44px] w-full gap-2 touch-manipulation text-sm"
                      asChild
                    >
                      <a href={SIGNAL_GROUP_HREF} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
                        Haven&apos;t received today&apos;s signal? Check Active Signal
                      </a>
                    </Button>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your trade is booked. Capital is reserved until the session completes.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[44px] w-full gap-2 touch-manipulation text-sm"
            asChild
          >
            <a href={SIGNAL_GROUP_HREF} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
              Haven&apos;t received today&apos;s signal? Check Active Signal
            </a>
          </Button>
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
        </Card>
      )}
    </div>
  )
}
