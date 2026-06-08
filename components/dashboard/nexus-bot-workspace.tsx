"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, Bot, CheckCircle2, Lock, MessageCircle, Sparkles, Zap } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { dispatchCustomerLedgerBump } from "@/lib/client/customer-ledger-sync"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NexusBotSessionPanel } from "@/components/dashboard/nexus-bot-session-panel"
import { TradeSessionProfitCelebration } from "@/components/dashboard/trade-session-profit-celebration"
import { NEXUS_AUTO_TRADE_PLANS, NEXUS_SIGNAL_STAKE_TIERS_USD } from "@/lib/nexus-bot/plans"
import { buildOperationsWhatsAppHref } from "@/lib/nexus-operations-whatsapp"
import {
  claimTradeCelebrationSession,
  isTradeCelebrationClaimed,
} from "@/lib/nexus-bot/trade-celebration-coordination"
import { VERIFY_STEPS_USER } from "@/lib/nexus-bot/user-session-messaging"
import { cn } from "@/lib/utils"

const LEGACY_RELEASE_KEY = "nexus_bot_legacy_released_v1"
const SIGNAL_GROUP_HREF = "https://chat.whatsapp.com/GH3tSCYOQf8C4UldGDBLBf"
const WHATSAPP_SIGNAL_CHANNEL_HREF = "https://whatsapp.com/channel/0029VbCX8n61SWt0e9a0L80p"
const WHATSAPP_SCREENSHOT_GROUP_HREF = "https://chat.whatsapp.com/GtBKzg2XxJ7IKfLGesAzzb"
const TRADE_FLOW_PERSIST_KEY = "nexus_bot_trade_flow_v1"

const QUICK_TRADING_GUIDE_STEPS = [
  "Go to our WhatsApp Channel and click the latest shared signal link.",
  "The link will bring you here and automatically fill in your trade code.",
  "Scroll down to this Nexus Bot workspace.",
  "Check your code in Step 1, click Verify in Step 2, set your capital amount, and click Activate Bot!",
  'Once activated, take a screenshot and click "Share Screenshot to Group" to celebrate with the community!',
] as const

type PersistedTradeFlow = {
  code: string
  verificationId: string
  verifiedAt: string
  stakeTier: number | "max"
}

function readPersistedTradeFlow(): PersistedTradeFlow | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(TRADE_FLOW_PERSIST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedTradeFlow
    if (!parsed.code || !parsed.verificationId) return null
    return parsed
  } catch {
    return null
  }
}

function writePersistedTradeFlow(flow: PersistedTradeFlow | null) {
  if (typeof window === "undefined") return
  try {
    if (!flow) sessionStorage.removeItem(TRADE_FLOW_PERSIST_KEY)
    else sessionStorage.setItem(TRADE_FLOW_PERSIST_KEY, JSON.stringify(flow))
  } catch {
    /* ignore */
  }
}

function QuickTradingGuideModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Trading Guide</DialogTitle>
        </DialogHeader>
        <ol className="space-y-3 text-sm leading-relaxed">
          {QUICK_TRADING_GUIDE_STEPS.map((step, index) => (
            <li key={step} className="flex gap-3 text-muted-foreground">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                aria-hidden
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] touch-manipulation"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            className="min-h-[44px] touch-manipulation"
            onClick={() => onOpenChange(false)}
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CommunityHubSection({ onOpenGuide }: { onOpenGuide: () => void }) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        className="min-h-[40px] w-full touch-manipulation gap-2 text-sm text-muted-foreground hover:text-foreground"
        onClick={onOpenGuide}
      >
        <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        Quick Trading Guide
      </Button>
      <CommunityActionButtons />
    </div>
  )
}

function CommunityActionButtons() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" className="min-h-[48px] touch-manipulation gap-1.5 px-2 text-xs sm:text-sm" asChild>
        <a href={WHATSAPP_SIGNAL_CHANNEL_HREF} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="text-center leading-tight">Join WhatsApp Channel</span>
        </a>
      </Button>
      <Button variant="outline" className="min-h-[48px] touch-manipulation gap-1.5 px-2 text-xs sm:text-sm" asChild>
        <a href={WHATSAPP_SCREENSHOT_GROUP_HREF} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="text-center leading-tight">Share Screenshot to Group</span>
        </a>
      </Button>
    </div>
  )
}

function SignalGroupLink({ className }: { className?: string }) {
  return (
    <a
      href={SIGNAL_GROUP_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 text-[11px] leading-snug text-muted-foreground underline-offset-2 hover:text-primary hover:underline touch-manipulation",
        className,
      )}
    >
      <MessageCircle className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">
        Missed today&apos;s signal? <span className="font-medium text-foreground/80">Check Active Signal</span>
      </span>
    </a>
  )
}

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
  earnings_withdrawable?: boolean
  profit_released_usd?: number
  session_start_at?: string | null
  session_end_at?: string | null
  session_progress_pct?: number
  earnings_locked?: boolean
}

type ProfitCelebration = {
  sessionId: string
  profitUsd: number
  summary: string
  hasEarnings?: boolean
  celebrationKind?: "earnings" | "stake_return"
  stakeReturnedUsd?: number
}

type NexusBotWorkspaceProps = {
  mainBalanceUsd?: number
  onActiveSessionCountsChange?: (counts: { copy: number; fix: number }) => void
  initialTradeCode?: string | null
}

export function NexusBotWorkspace({
  mainBalanceUsd = 0,
  onActiveSessionCountsChange,
  initialTradeCode = null,
}: NexusBotWorkspaceProps) {
  const { user } = useAuth()
  const { addNotification } = useNexusNotifications()
  const { formatUserMoney } = useUserPreferences()
  const [tab, setTab] = useState<BotTab>("signal")
  const [loading, setLoading] = useState(true)
  const [availableUsd, setAvailableUsd] = useState(mainBalanceUsd)
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [grants, setGrants] = useState<Record<string, boolean>>({})
  const [streak, setStreak] = useState({ current: 0, longest: 0, visits: 0 })
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
  const [guideOpen, setGuideOpen] = useState(false)

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

  const activateReady = Boolean(verifiedSession) && signalCommitUsd > 0 && !busy
  const canActivate = activateReady && activateConfirm

  const persistTradeFlow = useCallback(
    (patch: Partial<PersistedTradeFlow> & { code?: string; verificationId?: string }) => {
      const current = readPersistedTradeFlow()
      const code = patch.code ?? current?.code ?? codeInput
      const verificationId = patch.verificationId ?? current?.verificationId ?? verifiedSession?.verificationId
      if (!code || !verificationId) return
      writePersistedTradeFlow({
        code,
        verificationId,
        verifiedAt: patch.verifiedAt ?? current?.verifiedAt ?? verifiedSession?.verifiedAt ?? new Date().toISOString(),
        stakeTier: patch.stakeTier ?? stakeTier,
      })
    },
    [codeInput, stakeTier, verifiedSession],
  )

  const resetFlow = useCallback(() => {
    setFlowStep(1)
    setVerifiedSession(null)
    setVerifySteps([])
    setVerifyError(null)
    setActivateError(null)
    setActivateConfirm(false)
    writePersistedTradeFlow(null)
  }, [])

  const hadActiveSessionRef = useRef(false)
  const celebrationHandledRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }
    const botRes = await fetch("/api/user/nexus-bot", { headers: h, cache: "no-store" })
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
      if (active) {
        hadActiveSessionRef.current = true
        setFlowStep(5)
        writePersistedTradeFlow(null)
      } else if (hadActiveSessionRef.current) {
        hadActiveSessionRef.current = false
        resetFlow()
        window.setTimeout(() => void load(), 2500)
      }
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
        const sid = j.pendingProfitCelebration.sessionId
        if (!isTradeCelebrationClaimed(sid)) {
          claimTradeCelebrationSession(sid)
          setCelebration(j.pendingProfitCelebration)
        }
      }
      onActiveSessionCountsChange?.({ copy: 0, fix: active ? 1 : 0 })
    }
  }, [mainBalanceUsd, onActiveSessionCountsChange, resetFlow])

  useEffect(() => {
    const persisted = readPersistedTradeFlow()
    if (persisted) {
      setCodeInput(persisted.code)
      setVerifiedSession({
        verificationId: persisted.verificationId,
        verifiedAt: persisted.verifiedAt,
      })
      setStakeTier(persisted.stakeTier)
      setVerifySteps([...VERIFY_STEPS_USER])
      setFlowStep(4)
    }
  }, [])

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
    // Boot load only — balance refreshes must not wipe an in-progress verify/activate flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!celebration?.sessionId) return
    if (celebrationHandledRef.current === celebration.sessionId) return
    celebrationHandledRef.current = celebration.sessionId
    dispatchCustomerLedgerBump("nexus_trade_session_complete")
    void load()
    const hasEarnings =
      celebration.celebrationKind === "earnings" ||
      (celebration.hasEarnings ?? celebration.profitUsd > 0)
    addNotification({
      type: "trade",
      title: hasEarnings ? "Trade session complete" : "Session complete",
      message: hasEarnings
        ? `Released earnings ${formatUserMoney(celebration.profitUsd)} credited to Pocket.`
        : celebration.stakeReturnedUsd && celebration.stakeReturnedUsd > 0
          ? `Trading capital ${formatUserMoney(celebration.stakeReturnedUsd)} returned to Nexus Main.`
          : "Your trade session finished successfully.",
      detailText: celebration.summary,
      nav: { kind: "trade" },
    })
  }, [addNotification, celebration, formatUserMoney, load])

  useEffect(() => {
    const progress = activeSession?.session_progress_pct ?? 0
    const ms = activeSession ? (progress >= 80 ? 10_000 : 20_000) : 45_000
    const id = window.setInterval(() => void load(), ms)
    return () => window.clearInterval(id)
  }, [activeSession, activeSession?.session_progress_pct, load])

  useEffect(() => {
    setAvailableUsd(mainBalanceUsd)
  }, [mainBalanceUsd])

  useEffect(() => {
    if (!initialTradeCode?.trim()) return
    setCodeInput(initialTradeCode.trim().toUpperCase())
    setFlowStep(1)
    setVerifiedSession(null)
    setVerifyError(null)
    setActivateError(null)
    setActivateConfirm(false)
  }, [initialTradeCode])

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
      persistTradeFlow({
        code: codeInput,
        verificationId: out.verificationId,
        verifiedAt: out.verifiedAt,
        stakeTier,
      })
      setFlowStep(4)
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
          stakeReturnedUsd={celebration.stakeReturnedUsd}
          celebrationKind={celebration.celebrationKind}
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
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-success">
                {activeSession.headline ?? "Trade Session Active"}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeSession.detail ?? "Nexus Bot analysing market conditions"}
              </p>
            </div>
          </div>
          <NexusBotSessionPanel session={activeSession} formatMoney={formatUserMoney} />
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
                      flowStep >= n || (n === 4 && flowStep >= 4)
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

              <CommunityHubSection onOpenGuide={() => setGuideOpen(true)} />
              <QuickTradingGuideModal open={guideOpen} onOpenChange={setGuideOpen} />

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
                          onClick={() => {
                            setStakeTier(usd)
                            setFlowStep(4)
                            persistTradeFlow({ stakeTier: usd })
                          }}
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
                        onClick={() => {
                          setStakeTier("max")
                          setFlowStep(4)
                          persistTradeFlow({ stakeTier: "max" })
                        }}
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
                      {signalCommitUsd <= 0 ? (
                        <span className="mt-1 block text-destructive">
                          Add Nexus Main balance before activating.
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Step 4 · Activate Nexus Bot
                    </p>
                    <button
                      type="button"
                      aria-pressed={activateConfirm}
                      className={cn(
                        "flex min-h-[48px] w-full items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm touch-manipulation",
                        activateConfirm
                          ? "border-primary/40 bg-primary/10 ring-1 ring-primary/20"
                          : "border-border/70 bg-muted/20",
                      )}
                      onClick={() => setActivateConfirm((v) => !v)}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                          activateConfirm
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40 bg-background",
                        )}
                        aria-hidden
                      >
                        {activateConfirm ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                      </span>
                      <span>
                        I authorize Nexus Bot to manage the selected capital for this session. Session
                        profits release when the trade completes.
                      </span>
                    </button>
                    {activateError ? (
                      <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {activateError}
                      </p>
                    ) : null}
                    {!activateConfirm && activateReady ? (
                      <p className="text-xs text-muted-foreground">
                        Tap the confirmation above to enable Activate Nexus Bot.
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      className={cn(
                        "min-h-[52px] w-full touch-manipulation text-base font-semibold transition-all",
                        canActivate && "shadow-[0_0_24px_rgba(16,185,129,0.35)] ring-2 ring-success/40",
                        activateReady && !activateConfirm && "opacity-60",
                      )}
                      disabled={!canActivate}
                      onClick={() => void activateTradeSession()}
                    >
                      {busy ? "Booking trade…" : "Activate Nexus Bot"}
                    </Button>
                    <div className="pt-1 text-center">
                      <SignalGroupLink />
                    </div>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your trade is booked. Capital is reserved until the session completes.
            </p>
          )}
          <div className="border-t border-border/40 pt-3 text-center">
            <SignalGroupLink />
          </div>
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
