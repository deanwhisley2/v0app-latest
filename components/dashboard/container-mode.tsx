"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import toast from "react-hot-toast"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { supabase } from "@/lib/supabaseClient"
import {
  buildContainerDailySchedule,
  completedFixDaysSince,
  fixPeriodDayCount,
  scheduledEarnedUsdSmooth,
  totalScheduleTargetUsd,
  type FixPeriodMonths,
} from "@/lib/container-earnings-schedule"
import { applyPlatformTerminology } from "@/lib/platform-terminology"
import {
  COPY_TRADE_CYCLE_MS,
  COPY_TRADE_FORCE_CANCEL_FEE_RATE,
  COPY_TRADE_WITHDRAW_FEE_RATE,
  estimateCopyForcePulloutUsd,
} from "@/lib/copy-trade-policy"
import { fixedTradeScheduleProjection } from "@/lib/fixed-trade-projection"
import {
  fixInsuranceAndWithdrawFees,
  splitFixedTradeOpenCommitUsd,
} from "@/lib/nexus-financial-policy"
import {
  convertFromUsd,
  formatLocalFiatAmount,
  localFiatUnitsToUsd,
  parseCustomerLocalAmountInput,
  usdFromCustomerLocalInput,
} from "@/lib/currency-display"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import type { Coin } from "@/lib/coins-data"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { computePlatformLiveStats } from "@/lib/platform-live-stats"
import { Checkbox } from "@/components/ui/checkbox"
import { fixedTradeTierHint } from "@/lib/fix-trade-access"
import { readJsonSafe, toastMutationError, toastMutationSuccess } from "@/lib/client/mutation-api-feedback"
import { refreshLiveBalanceBeforeAction } from "@/lib/client/refresh-live-balance"
import { sanitizeCustomerNotificationText } from "@/lib/notifications/customer-notification-language"
import { formatAmountInputLive } from "@/lib/customer-amount-input-format"
import { SmartAmountInput } from "@/components/ui/smart-amount-input"
import { TraderPersonaAvatar } from "@/components/dashboard/trader-persona-avatar"
import { cn } from "@/lib/utils"
import { MOBILE_FLAT_SURFACE, MOBILE_STATIC_MOTION } from "@/lib/dashboard-mobile-render-policy"
import { useMarketPriceAuthority } from "@/hooks/use-market-price-authority"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Users,
  TrendingUp,
  TrendingDown,
  Lock,
  Unlock,
  Trophy,
  Shield,
  Zap,
  Copy,
  Settings,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Info,
  Play,
  Pause,
  X,
  Crown,
  Target,
  BarChart3,
  Clock,
  DollarSign,
  Percent,
  Award,
  Loader2,
  Wallet,
  ArrowUpRight,
  Calendar,
  Timer,
  Eye,
  RefreshCw,
  MessageSquare,
  Store,
} from "lucide-react"

// User levels
export type UserLevel = 1 | 2 | 3 | 4 | 5
type FixPeriod = 1 | 3 | 6

interface MasterTrader {
  id: string
  name: string
  avatar: string
  winRate: number
  totalProfit: number
  followers: number
  totalTrades: number
  riskLevel: "Low" | "Medium" | "High"
  speciality: string
  minLevel: UserLevel
  status: "active" | "paused"
  monthlyReturn: number
  maxDrawdown: number
  description: string
  strategies: string[]
  locked?: boolean
  lockReason?: string
  legacyIds?: string[]
}

type ApiContainerDesk = {
  id: string
  name: string
  avatar: string
  winRate: number
  riskLevel: string
  speciality: string
  description: string
  strategies: string[]
  monthlyReturn: number
  locked?: boolean
  lockReason?: string
  legacyIds?: string[]
}

function mapApiDesk(row: ApiContainerDesk): MasterTrader {
  return {
    id: row.id,
    name: applyPlatformTerminology(row.name),
    avatar: row.avatar,
    winRate: row.winRate,
    totalProfit: 0,
    followers: 0,
    totalTrades: 0,
    riskLevel: row.riskLevel as MasterTrader["riskLevel"],
    speciality: row.speciality,
    minLevel: 1,
    status: "active",
    monthlyReturn: row.monthlyReturn,
    maxDrawdown: 0,
    description: row.description,
    strategies: row.strategies,
    locked: row.locked,
    lockReason: row.lockReason,
    legacyIds: row.legacyIds,
  }
}

interface ActiveCopyTrade {
  traderId: string
  amount: number
  startTime: Date
  minEndTime: Date // 24 hours minimum
  earned: number
  isTrading: boolean
  /** Continue in recovery toward modeled +5% exit (see copy-trade policy). */
  autoAdjust: boolean
  /** Drawdown / adverse-move stress indicator for UX (0–1). */
  drawdownPct: number
  /** Desk holding through volatility while auto-adjust is on. */
  recoveryHold: boolean
  /** Server-backed session after Nexus Main debit (POST /api/user/copy-trade/open). */
  copySessionId?: string
}

interface ActiveFixTrade {
  traderId: string
  amount: number
  period: FixPeriod
  startTime: Date
  endTime: Date
  earned: number
  isLocked: boolean
  canWithdrawEarnings: boolean
  lastWithdrawalDate: Date | null
  totalWithdrawn: number
  dailyWithdrawUsed: number // legacy field (unused)
  coinSymbol: string // The coin this trade is fixed on
  fixedPrice: number // Lock reference level (USD); may mirror live spot at open when server omits snapshot
  /** When true, fixedPrice was filled from live authority at open (server omitted fixedPriceUsd). */
  fixedPriceFromLiveFeed?: boolean
  /** Current authority reference for desk coin (display only). */
  liveReferenceUsd?: number
  /** Platform-deposit container: random positive daily buckets that sum to an internal schedule target (server-side). */
  dailySchedule?: number[]
  /** When true, `earned` is hydrated from the server accrual engine — do not recompute from local schedule. */
  serverAccrued?: boolean
  /** When set, early exit is processed via POST /api/user/fixed-trade/early-exit (funded server session). */
  serverSessionId?: string
  /** Days until lease end (ceil); may be negative if past lease. */
  daysUntilMaturity?: number
  /** Lease calendar ended but session still active — worker / maturity-check will settle. */
  leaseEndedAwaitingSettlement?: boolean
}

/** Cumulative policy gross (remaining earned + already withdrawn) — same units as server `earnedUsd` + withdrawals. */
function fixEarningsGrossUsd(trade: ActiveFixTrade): number {
  return Math.round((trade.earned + (trade.totalWithdrawn ?? 0)) * 100) / 100
}

function fixUnreleasedHeadroomUsd(trade: ActiveFixTrade): number {
  return Math.max(0, Math.round((fixPolicyDisplayedGrossUsd(trade) - (trade.totalWithdrawn ?? 0)) * 100) / 100)
}

/**
 * Gross accrual shown on policy: min(schedule cap, max(confirmed gross, smooth intra-day schedule)).
 * Deterministic from `buildContainerDailySchedule` — not RNG.
 */
function fixPolicyDisplayedGrossUsd(trade: ActiveFixTrade, now = new Date()): number {
  if (trade.serverAccrued) {
    return fixEarningsGrossUsd(trade)
  }
  if (!trade.dailySchedule?.length) return fixEarningsGrossUsd(trade)
  const cap = totalScheduleTargetUsd(trade.dailySchedule)
  const smooth = scheduledEarnedUsdSmooth(trade.dailySchedule, trade.startTime, now)
  const gross = fixEarningsGrossUsd(trade)
  return Math.min(cap, Math.max(gross, smooth))
}

function fixPolicyDisplayedRemainingUsd(trade: ActiveFixTrade, now = new Date()): number {
  const w = trade.totalWithdrawn ?? 0
  return Math.max(0, Math.round((fixPolicyDisplayedGrossUsd(trade, now) - w) * 100) / 100)
}

function FixEarnedDisplay({
  amountUsd,
  formatUserMoney,
}: {
  amountUsd: number
  formatUserMoney: (usd: number) => string
}) {
  const [display, setDisplay] = useState(amountUsd)
  const fromRef = useRef(amountUsd)

  useEffect(() => {
    const from = fromRef.current
    const to = amountUsd
    if (Math.abs(to - from) < 0.005) {
      fromRef.current = to
      setDisplay(to)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const dur = 1400
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / dur)
      const eased = 1 - (1 - p) ** 2
      const next = from + (to - from) * eased
      setDisplay(next)
      if (p < 1) raf = requestAnimationFrame(tick)
      else {
        fromRef.current = to
        setDisplay(to)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [amountUsd])

  return <span className="font-mono font-bold text-success">+{formatUserMoney(display)}</span>
}

/** Trader personas load from GET /api/user/container-context (Supabase-backed catalog). */

const levelRequirements = {
  1: { name: "Starter", minDeposit: 100, minTrades: 0, badge: "bronze", color: "#CD7F32" },
  2: { name: "Trader", minDeposit: 1000, minTrades: 10, badge: "silver", color: "#C0C0C0" },
  3: { name: "Pro", minDeposit: 5000, minTrades: 50, badge: "gold", color: "#FFD700" },
  4: { name: "Elite", minDeposit: 25000, minTrades: 200, badge: "platinum", color: "#E5E4E2" },
  5: { name: "Master", minDeposit: 100000, minTrades: 500, badge: "diamond", color: "#B9F2FF" },
}

type ContainerTab = "copy" | "fix" | "dashboard"

interface ContainerModeProps {
  userLevel?: UserLevel
  /** Level 2 only: designated retailer credit seller (profiles.retailer_credit_seller or env allowlist). */
  retailerCreditSeller?: boolean
  /** Level 2 retailer: Nexus blocks new fixed-trade locks until pending inbound mobile-money clears (see retailer-pending-summary). */
  retailerLiquidityOpsBlocked?: boolean
  /** DB-backed container liquid (withdrawable) — unified earnings banner. */
  containerLiquidEarningsUsd?: number
  /** Pocket withdrawal policy hints (dashboard API). */
  withdrawalPolicyHint?: {
    minUsd: number
    maxUsd: number
    cooldownActive: boolean
    msRemaining: number
  } | null
}

export function ContainerMode({
  userLevel = 1,
  retailerCreditSeller = false,
  retailerLiquidityOpsBlocked = false,
  containerLiquidEarningsUsd = 0,
  withdrawalPolicyHint = null,
}: ContainerModeProps) {
  const { formatUserMoney, currency, locale, t } = useUserPreferences()
  const { addNotification } = useNexusNotifications()
  const [activeTab, setActiveTab] = useState<ContainerTab>("dashboard")
  const [selectedTrader, setSelectedTrader] = useState<MasterTrader | null>(null)
  const [showInstructions, setShowInstructions] = useState(true)
  const [copyAmount, setCopyAmount] = useState("500")
  const [fixAmount, setFixAmount] = useState("1000")

  useEffect(() => {
    setCopyAmount((v) => formatAmountInputLive(v, locale, currency))
    setFixAmount((v) => formatAmountInputLive(v, locale, currency))
  }, [locale, currency])
  const [fixPeriod, setFixPeriod] = useState<FixPeriod>(1)
  const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [fixTradeActionId, setFixTradeActionId] = useState<string | null>(null)
  const [copyRiskAcknowledged, setCopyRiskAcknowledged] = useState(false)
  const [deskModalMounted, setDeskModalMounted] = useState(false)

  const [activeCopyTrades, setActiveCopyTrades] = useState<ActiveCopyTrade[]>([])

  const [activeFixTrades, setActiveFixTrades] = useState<ActiveFixTrade[]>([])

  const activeCopyTradesRef = useRef<ActiveCopyTrade[]>([])
  const copySettlingRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    activeCopyTradesRef.current = activeCopyTrades
  }, [activeCopyTrades])

  /** Re-render fixed-trade policy accrual between server hydrates (smooth schedule is time-based). */
  const [earnDisplayTick, setEarnDisplayTick] = useState(0)
  const deskRootRef = useRef<HTMLDivElement>(null)
  const [deskInView, setDeskInView] = useState(true)

  // Countdown timer effect
  const [countdowns, setCountdowns] = useState<Record<string, string>>({})

  useEffect(() => {
    setDeskModalMounted(true)
  }, [])

  useEffect(() => {
    if (!selectedTrader && !showCancelConfirm) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [selectedTrader, showCancelConfirm])

  useEffect(() => {
    if (selectedTrader) setCopyRiskAcknowledged(false)
  }, [selectedTrader?.id])

  useEffect(() => {
    const el = deskRootRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setDeskInView(entry?.isIntersecting ?? false),
      { root: null, threshold: 0.02 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const [copyDeskCatalog, setCopyDeskCatalog] = useState<MasterTrader[]>([])
  const [fixDeskCatalog, setFixDeskCatalog] = useState<MasterTrader[]>([])
  const [copyMinUsdPolicy, setCopyMinUsdPolicy] = useState(7)
  const [fixMinUsdPolicy, setFixMinUsdPolicy] = useState(5)
  const [containerLaunch, setContainerLaunch] = useState<{
    promotionsActive?: boolean
    starterFixUnlock?: boolean
    starterFixPersonaId?: string
  } | null>(null)

  const { btc: btcSpotRef, getSymbolPrice, authorityRevision } = useMarketPriceAuthority()

  useEffect(() => {
    if (!authorityRevision) return
    setActiveFixTrades((prev) =>
      prev.map((t) => {
        const live = getSymbolPrice(t.coinSymbol)
        return live != null ? { ...t, liveReferenceUsd: live } : t
      })
    )
  }, [authorityRevision, getSymbolPrice])

  useEffect(() => {
    let cancelled = false
    const loadCatalog = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch("/api/user/container-context", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const out = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          traders?: { copy?: ApiContainerDesk[]; fix?: ApiContainerDesk[] }
          copyMinUsd?: number
          fixMinUsd?: number
          launch?: {
            promotionsActive?: boolean
            starterFixUnlock?: boolean
            starterFixPersonaId?: string
          }
        }
        if (cancelled || !res.ok || !out.ok || !out.traders) return
        setCopyDeskCatalog((out.traders.copy ?? []).map(mapApiDesk))
        setFixDeskCatalog((out.traders.fix ?? []).map(mapApiDesk))
        if (typeof out.copyMinUsd === "number") setCopyMinUsdPolicy(out.copyMinUsd)
        if (typeof out.fixMinUsd === "number") setFixMinUsdPolicy(out.fixMinUsd)
        setContainerLaunch(out.launch ?? null)
      } catch {
        /* ignore */
      }
    }
    void loadCatalog()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void loadCatalog()
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const [liveStatsTick, setLiveStatsTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setLiveStatsTick((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const liveStats = useMemo(() => computePlatformLiveStats(), [liveStatsTick])

  const fixProjectionPreview = useMemo(() => {
    if (activeTab !== "fix" || !selectedTrader) return null
    const grossUsd = usdFromCustomerLocalInput(fixAmount, currency)
    if (grossUsd <= 0) return null
    const fees = fixInsuranceAndWithdrawFees(userLevel, selectedTrader.riskLevel)
    const { principalUsd, insuranceFeeUsd } = splitFixedTradeOpenCommitUsd(grossUsd, fees.insuranceFeeRate)
    if (!(principalUsd > 0)) return null
    const seed = `${selectedTrader.id}-${fixPeriod}-${grossUsd}`
    return {
      ...fixedTradeScheduleProjection(principalUsd, fixPeriod as FixPeriodMonths, seed, 0),
      grossCommitUsd: grossUsd,
      principalUsd,
      insuranceFeeUsd,
      insuranceFeeRate: fees.insuranceFeeRate,
    }
  }, [activeTab, selectedTrader, fixAmount, fixPeriod, currency, userLevel])

  // Server-authoritative recovery: active copy/fixed sessions after login, refresh, device change, or runtime restart.
  useEffect(() => {
    let cancelled = false

    const hydrate = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) {
          if (!cancelled) {
            setActiveCopyTrades([])
            setActiveFixTrades([])
          }
          return
        }
        const res = await fetch("/api/user/trade-sessions/active", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const out = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          copySessions?: Array<{
            kind: "copy"
            sessionId: string
            traderPersonaId: string
            stakeUsd: number
            createdAt: string
            autoAdjust: boolean
            accruedGrossUsd?: number
            displayAccruedGrossUsd?: number
            targetGrossProfitUsd?: number
            cycleEndsAt?: string
          }>
          fixedSessions?: Array<{
            kind: "fixed"
            sessionId: string
            traderPersonaId: string | null
            principalUsd: number
            fixPeriodMonths: FixPeriod
            seedKey: string
            createdAt: string
            leaseEndAt: string
            coinSymbol: string
            fixedPriceUsd: number
            liveReferenceUsd?: number | null
            earnedUsd: number
            insuranceFeeUsd?: number
            totalWithdrawnUsd: number
            lastWithdrawalAt: string | null
            releasableHeadroomUsd: number
            daysUntilMaturity?: number
            leaseEndedAwaitingSettlement?: boolean
          }>
        }
        if (cancelled || !res.ok || !out.ok) return

        const copyList = out.copySessions ?? []
        const fixList = out.fixedSessions ?? []

        const copy: ActiveCopyTrade[] = copyList.map((row) => {
          const startMs = new Date(row.createdAt).getTime()
          const earned =
            typeof row.displayAccruedGrossUsd === "number"
              ? row.displayAccruedGrossUsd
              : typeof row.accruedGrossUsd === "number"
                ? row.accruedGrossUsd
                : 0
          return {
            traderId: row.traderPersonaId,
            amount: row.stakeUsd,
            startTime: new Date(row.createdAt),
            minEndTime: new Date(startMs + COPY_TRADE_CYCLE_MS),
            earned,
            isTrading: true,
            autoAdjust: row.autoAdjust,
            drawdownPct: 0,
            recoveryHold: false,
            copySessionId: row.sessionId,
          }
        })

        const fix: ActiveFixTrade[] = fixList.map((row) => {
          const grossPolicy = row.earnedUsd
          const withdrawn = row.totalWithdrawnUsd
          const remaining = Math.max(0, Math.round((grossPolicy - withdrawn) * 100) / 100)
          return {
            traderId: row.traderPersonaId ?? "desk-unknown",
            amount: row.principalUsd,
            period: row.fixPeriodMonths,
            startTime: new Date(row.createdAt),
            endTime: new Date(row.leaseEndAt),
            earned: remaining,
            isLocked: true,
            canWithdrawEarnings: true,
            lastWithdrawalDate: row.lastWithdrawalAt ? new Date(row.lastWithdrawalAt) : null,
            totalWithdrawn: row.totalWithdrawnUsd,
            dailyWithdrawUsed: 0,
            coinSymbol: row.coinSymbol,
            fixedPrice: row.fixedPriceUsd,
            liveReferenceUsd:
              typeof row.liveReferenceUsd === "number" ? row.liveReferenceUsd : undefined,
            serverAccrued: true,
            serverSessionId: row.sessionId,
            daysUntilMaturity: typeof row.daysUntilMaturity === "number" ? row.daysUntilMaturity : undefined,
            leaseEndedAwaitingSettlement: row.leaseEndedAwaitingSettlement === true,
          }
        })

        setActiveCopyTrades(copy)
        setActiveFixTrades(fix)
      } catch {
        /* ignore */
      }
    }

    void hydrate()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (cancelled) return
      if (sess?.access_token) void hydrate()
      else {
        setActiveCopyTrades([])
        setActiveFixTrades([])
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const updateCountdowns = () => {
      const newCountdowns: Record<string, string> = {}
      
      activeCopyTrades.forEach(trade => {
        const remaining = trade.minEndTime.getTime() - Date.now()
        if (remaining > 0) {
          const hours = Math.floor(remaining / (1000 * 60 * 60))
          const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
          const seconds = Math.floor((remaining % (1000 * 60)) / 1000)
          newCountdowns[`copy_${trade.traderId}`] = `${hours}h ${minutes}m ${seconds}s`
        } else {
          newCountdowns[`copy_${trade.traderId}`] = "Can cancel"
        }
      })

      activeFixTrades.forEach(trade => {
        const remaining = trade.endTime.getTime() - Date.now()
        if (remaining > 0) {
          const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
          const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
          newCountdowns[`fix_${trade.traderId}`] = `${days}d ${hours}h`
        } else {
          newCountdowns[`fix_${trade.traderId}`] = "Complete"
        }
      })

      setCountdowns(newCountdowns)
    }

    if (!deskInView) return
    updateCountdowns()
    const interval = setInterval(updateCountdowns, 1000)
    return () => clearInterval(interval)
  }, [activeCopyTrades, activeFixTrades, deskInView])

  const notifyCopy = useCallback(
    (title: string, message: string) => {
      addNotification({ type: "system", title, message, nav: { kind: "notifications" } })
    },
    [addNotification]
  )

  /** Bounded copy-trade mark-to-model (not spot leverage); separate from fixed schedule. */
  useEffect(() => {
    if (activeCopyTrades.length === 0 && activeFixTrades.length === 0) return
    const poll = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch("/api/user/trade-sessions/active", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const out = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          copySessions?: Array<{ sessionId: string; accruedGrossUsd?: number; displayAccruedGrossUsd?: number }>
          fixedSessions?: Array<{
            sessionId: string
            earnedUsd: number
            totalWithdrawnUsd: number
            daysUntilMaturity?: number
            leaseEndedAwaitingSettlement?: boolean
          }>
        }
        if (!res.ok || !out.ok) return
        setActiveCopyTrades((prev) => {
          const list = out.copySessions ?? []
          return prev.map((t) => {
            const row = list.find((c) => c.sessionId === t.copySessionId)
            const earned =
              typeof row?.displayAccruedGrossUsd === "number"
                ? row.displayAccruedGrossUsd
                : typeof row?.accruedGrossUsd === "number"
                  ? row.accruedGrossUsd
                  : t.earned
            return row ? { ...t, earned } : t
          })
        })
        setActiveFixTrades((prev) => {
          const list = out.fixedSessions ?? []
          return prev.map((tr) => {
            const row = list.find((f) => f.sessionId === tr.serverSessionId)
            if (!row) return tr
            const remaining = Math.max(0, Math.round((row.earnedUsd - row.totalWithdrawnUsd) * 100) / 100)
            return {
              ...tr,
              earned: remaining,
              totalWithdrawn: row.totalWithdrawnUsd,
              daysUntilMaturity: typeof row.daysUntilMaturity === "number" ? row.daysUntilMaturity : tr.daysUntilMaturity,
              leaseEndedAwaitingSettlement:
                row.leaseEndedAwaitingSettlement === true ? true : tr.leaseEndedAwaitingSettlement,
            }
          })
        })
      } catch {
        /* ignore */
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), 8000)
    return () => window.clearInterval(id)
  }, [activeCopyTrades.length, activeFixTrades.length])

  const maturitySweepPending = useMemo(
    () => activeFixTrades.some((t) => t.leaseEndedAwaitingSettlement === true),
    [activeFixTrades],
  )

  useEffect(() => {
    if (!maturitySweepPending) return
    let cancelled = false
    const sweep = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token || cancelled) return
        const res = await fetch("/api/user/fixed-trade/maturity-check", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const out = (await readJsonSafe(res)) as {
          ok?: boolean
          success?: boolean
          results?: Array<{
            sessionId: string
            ok: boolean
            idempotent?: boolean
            settlement?: {
              principalReturnedUsd: number
              finalPolicyGrossUsd: number
              terminalGrossUsd: number
              terminalFeeUsd: number
              terminalLiquidNetUsd: number
            }
          }>
        }
        if (cancelled || !res.ok || out.success === false || out.ok === false) return
        const settledIds = new Set<string>()
        for (const r of out.results ?? []) {
          if (!r.ok || !r.settlement || r.idempotent) continue
          settledIds.add(r.sessionId)
          addNotification({
            type: "system",
            title: t("notifications.trade.fixedFinishedTitle"),
            message: t("notifications.trade.fixedFinishedMessage")
              .replace("{{principal}}", formatUserMoney(r.settlement.principalReturnedUsd))
              .replace("{{pocket}}", formatUserMoney(r.settlement.terminalLiquidNetUsd)),
            detailText: t("notifications.trade.fixedFinishedDetail"),
            nav: { kind: "notifications" },
          })
        }
        if (settledIds.size > 0) {
          setActiveFixTrades((prev) => prev.filter((t) => !t.serverSessionId || !settledIds.has(t.serverSessionId)))
        }
      } catch {
        /* ignore */
      }
    }
    void sweep()
    const id = window.setInterval(() => void sweep(), 45_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [maturitySweepPending, addNotification, formatUserMoney, t])

  /** Auto-settle copy sessions after 24h — canonical scheduled server settlement. */
  useEffect(() => {
    const id = window.setInterval(() => {
      const trades = activeCopyTradesRef.current
      void (async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return

        for (const copyTrade of trades) {
          if (!copyTrade.copySessionId) continue
          if (copySettlingRef.current.has(copyTrade.copySessionId)) continue

          const elapsed = Date.now() - copyTrade.startTime.getTime()
          if (elapsed < COPY_TRADE_CYCLE_MS) continue

          copySettlingRef.current.add(copyTrade.copySessionId)

          try {
            const res = await fetch("/api/user/copy-trade/close", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                sessionId: copyTrade.copySessionId,
                floatingPnLUsd: 0,
                coinImpactFraction: 0,
              }),
            })
            const out = (await res.json().catch(() => ({}))) as {
              error?: string
              settlement?: {
                netToMainUsd?: number
                liquidCreditUsd?: number
                mainCreditUsd?: number
                kind?: string
              }
            }
            if (!res.ok) throw new Error(out.error || "Settlement failed.")

            setActiveCopyTrades((prev) => prev.filter((x) => x.copySessionId !== copyTrade.copySessionId))
            notifyCopy(
              t("notifications.trade.copyCycleTitle"),
              t("notifications.trade.copyCycleMessage")
                .replace(
                  "{{mainAdd}}",
                  formatUserMoney(out.settlement?.mainCreditUsd ?? out.settlement?.netToMainUsd ?? 0),
                )
                .replace("{{pocketAdd}}", formatUserMoney(out.settlement?.liquidCreditUsd ?? 0)),
            )
          } catch (e) {
            notifyCopy(
              t("notifications.trade.copySettlementFailTitle"),
              e instanceof Error ? e.message : t("notifications.trade.copySettlementFailMessage"),
            )
          } finally {
            copySettlingRef.current.delete(copyTrade.copySessionId)
          }
        }
      })()
    }, 4000)
    return () => window.clearInterval(id)
  }, [formatUserMoney, notifyCopy, t])

  useEffect(() => {
    const id = window.setInterval(() => setEarnDisplayTick((n) => n + 1), 10_000)
    return () => window.clearInterval(id)
  }, [])

  // Fixed-trade: keep `earned` aligned with intra-day schedule accrual (bounded, ledger-style gross − withdrawals).
  useEffect(() => {
    const sync = () => {
      setActiveFixTrades((trades) =>
        trades.map((trade) => {
          if (trade.serverAccrued) return trade
          if (!trade.dailySchedule?.length) return trade
          const nextEarned = fixPolicyDisplayedRemainingUsd(trade)
          return Math.abs(nextEarned - trade.earned) > 0.005 ? { ...trade, earned: nextEarned } : trade
        })
      )
    }
    sync()
    const id = window.setInterval(sync, 15_000)
    return () => window.clearInterval(id)
  }, [activeFixTrades.length])

  const availableTraders = copyDeskCatalog.filter((t) => !t.locked)
  const lockedTraders = copyDeskCatalog.filter((t) => t.locked)

  const fixLiquidityGate = userLevel === 2 && retailerLiquidityOpsBlocked
  const fixAvailableTraders = fixDeskCatalog.filter((t) => !t.locked)
  const fixTierLockedTraders = fixDeskCatalog.filter((t) => t.locked)

  const totalCryptoAllocationUsd = useMemo(
    () =>
      activeCopyTrades.reduce((sum, t) => sum + t.amount, 0) +
      activeFixTrades.reduce((sum, t) => sum + t.amount, 0),
    [activeCopyTrades, activeFixTrades]
  )

  const totalEarnedDisplayUsd = useMemo(() => {
    void earnDisplayTick
    const copySum = activeCopyTrades.reduce((sum, t) => sum + t.earned, 0)
    const fixSum = activeFixTrades.reduce((sum, t) => sum + fixPolicyDisplayedRemainingUsd(t), 0)
    const liq = Number.isFinite(containerLiquidEarningsUsd) ? containerLiquidEarningsUsd : 0
    return copySum + fixSum + liq
  }, [activeCopyTrades, activeFixTrades, earnDisplayTick, containerLiquidEarningsUsd])

  const handleActivateCopy = (trader: MasterTrader) => {
    void (async () => {
      const raw = parseCustomerLocalAmountInput(copyAmount)
      const amount = roundUsd2(localFiatUnitsToUsd(raw, currency))
      if (isNaN(raw) || raw <= 0 || !(amount > 0)) {
        toast.error(t("container.error.invalidLocalAmount"), { duration: 6000 })
        return
      }
      if (amount < copyMinUsdPolicy) {
        toast.error(
          t("container.error.belowCopyMinimum").replace("{{min}}", formatUserMoney(copyMinUsdPolicy)),
          { duration: 6000 },
        )
        return
      }
      if (!copyRiskAcknowledged) return

      setIsProcessing(true)
      try {
        const refreshed = await refreshLiveBalanceBeforeAction()
        if (!refreshed.ok) {
          toast.error(refreshed.error, { duration: 5000 })
          return
        }
        const mainUsd = refreshed.balance.available_balance
        if (amount > mainUsd) {
          toast.error(t("withdrawal.error.insufficientBalance"), { duration: 6000 })
          return
        }
        const token = refreshed.token
        const res = await fetch("/api/user/copy-trade/open", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            stakeUsd: amount,
            amountInputLocal: raw,
            amountInputRaw: copyAmount,
            inputCurrency: currency,
            traderPersonaId: trader.id,
          }),
        })
        const out = (await readJsonSafe(res)) as {
          success?: boolean
          error?: string
          sessionId?: string
          createdAt?: string
        }
        if (!res.ok || out?.success === false) {
          toastMutationError(out, "Allocation failed.")
          return
        }

        const startMs = out.createdAt ? new Date(out.createdAt).getTime() : Date.now()
        const newTrade: ActiveCopyTrade = {
          traderId: trader.id,
          amount,
          startTime: new Date(startMs),
          minEndTime: new Date(startMs + COPY_TRADE_CYCLE_MS),
          earned: 0,
          isTrading: true,
          autoAdjust: false,
          drawdownPct: 0,
          recoveryHold: false,
          copySessionId: out.sessionId,
        }
        setActiveCopyTrades((prev) => [...prev, newTrade])
        notifyCopy(
          t("notifications.trade.copyStartedTitle"),
          t("notifications.trade.copyStartedBody")
            .replace("{{amount}}", formatUserMoney(amount))
            .replace("{{trader}}", trader.name),
        )
        notifyCopy(t("notifications.trade.recoveryHoldTitle"), t("notifications.trade.recoveryHoldBody"))
        setSelectedTrader(null)
        setCopyRiskAcknowledged(false)
      } finally {
        setIsProcessing(false)
      }
    })()
  }

  const toggleCopyAutoAdjust = (traderId: string) => {
    void (async () => {
      const target = activeCopyTrades.find((t) => t.traderId === traderId)
      if (!target) return
      const next = !target.autoAdjust

      if (target.copySessionId) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          const token = session?.access_token
          if (!token) {
            notifyCopy(
              t("notifications.trade.signInRequiredTitle"),
              t("notifications.trade.signInRequiredBody"),
            )
            return
          }
          const res = await fetch("/api/user/copy-trade/session-metadata", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ sessionId: target.copySessionId, autoAdjust: next }),
          })
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string }
            notifyCopy(
              t("notifications.trade.syncFailedTitle"),
              sanitizeCustomerNotificationText(
                j.error || t("notifications.trade.syncFailedBody"),
                t("notifications.trade.syncFailedBody"),
              ),
            )
            return
          }
        } catch (e) {
          notifyCopy(
            t("notifications.trade.syncFailedTitle"),
            e instanceof Error
              ? sanitizeCustomerNotificationText(e.message, t("notifications.trade.networkErrorBody"))
              : t("notifications.trade.networkErrorBody"),
          )
          return
        }
      }

      setActiveCopyTrades((prev) =>
        prev.map((trade) => {
          if (trade.traderId !== traderId) return trade
          notifyCopy(
            next ? t("notifications.trade.autoAdjustOnTitle") : t("notifications.trade.autoAdjustOffTitle"),
            next ? t("notifications.trade.autoAdjustOnBody") : t("notifications.trade.autoAdjustOffBody"),
          )
          return { ...trade, autoAdjust: next }
        })
      )
    })()
  }

  const handleForcePullOutCopy = (traderId: string) => {
    void (async () => {
      const trade = activeCopyTrades.find((t) => t.traderId === traderId)
      if (!trade?.copySessionId) {
        toast.error("This copy allocation has no server session — refresh and try again.", { duration: 6000 })
        return
      }

      setIsProcessing(true)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error("Sign in to settle copy-trade.")

        const res = await fetch("/api/user/copy-trade/close", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            sessionId: trade.copySessionId,
            floatingPnLUsd: trade.earned,
            coinImpactFraction: trade.drawdownPct,
            force: true,
          }),
        })
        const out = (await readJsonSafe(res)) as {
          success?: boolean
          error?: string
          settlement?: {
            netToMainUsd?: number
            mainCreditUsd?: number
            liquidCreditUsd?: number
            cancelFeeUsd?: number
            withdrawFeeUsd?: number
          }
        }
        if (!res.ok || out?.success === false) {
          toastMutationError(out, "Close failed. Refresh and retry.")
          return
        }

        const mainCred = Number(out.settlement?.mainCreditUsd ?? out.settlement?.netToMainUsd ?? 0)
        const liqCred = Number(out.settlement?.liquidCreditUsd ?? 0)
        setActiveCopyTrades((prev) => prev.filter((t) => t.traderId !== traderId))
        setShowCancelConfirm(null)
        notifyCopy(
          t("notifications.trade.forcePulloutTitle"),
          t("notifications.trade.forcePulloutBody")
            .replace("{{main}}", formatUserMoney(mainCred))
            .replace("{{pocket}}", formatUserMoney(liqCred)),
        )
        notifyCopy(
          t("notifications.trade.forcePulloutFeesTitle"),
          t("notifications.trade.forcePulloutFeesBody")
            .replace("{{cancel}}", formatUserMoney(out.settlement?.cancelFeeUsd ?? 0))
            .replace("{{withdraw}}", formatUserMoney(out.settlement?.withdrawFeeUsd ?? 0)),
        )
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Settlement failed.", { duration: 6500 })
      } finally {
        setIsProcessing(false)
      }
    })()
  }

  const handleActivateFix = (trader: MasterTrader) => {
    void (async () => {
      const raw = parseCustomerLocalAmountInput(fixAmount)
      const grossCommitUsd = roundUsd2(localFiatUnitsToUsd(raw, currency))
      if (isNaN(raw) || raw <= 0 || !(grossCommitUsd > 0)) {
        toast.error(t("container.error.invalidLocalAmount"), { duration: 6500 })
        return
      }
      const openFees = fixInsuranceAndWithdrawFees(userLevel, trader.riskLevel)
      const { principalUsd: netPrincipalUsd, insuranceFeeUsd: openInsuranceUsd } =
        splitFixedTradeOpenCommitUsd(grossCommitUsd, openFees.insuranceFeeRate)
      if (!(netPrincipalUsd > 0)) {
        toast.error("Allocation is too small after insurance is reserved from your commitment.", { duration: 6000 })
        return
      }
      if (netPrincipalUsd < fixMinUsdPolicy) {
        toast.error(
          t("container.error.belowFixMinimum").replace("{{min}}", formatUserMoney(fixMinUsdPolicy)),
          { duration: 6000 },
        )
        return
      }
      if (trader.locked || fixLiquidityGate) return

      setIsProcessing(true)
      try {
        const refreshed = await refreshLiveBalanceBeforeAction()
        if (!refreshed.ok) {
          toast.error(refreshed.error, { duration: 5000 })
          return
        }
        const mainUsd = refreshed.balance.available_balance
        if (grossCommitUsd > mainUsd) {
          toast.error(t("withdrawal.error.insufficientBalance"), { duration: 6000 })
          return
        }
        const token = refreshed.token
        const res = await fetch("/api/user/fixed-trade/open", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            commitUsd: grossCommitUsd,
            principalUsd: grossCommitUsd,
            riskClass: trader.riskLevel,
            fixPeriodMonths: fixPeriod,
            traderPersonaId: trader.id,
          }),
        })
        const out = (await readJsonSafe(res)) as {
          success?: boolean
          error?: string
          sessionId?: string
          seedKey?: string
          createdAt?: string
          leaseEndAt?: string
          coinSymbol?: string
          fixedPriceUsd?: number
          grossCommitUsd?: number
          principalUsd?: number
          fees?: { insuranceFeeUsd?: number }
        }
        if (!res.ok || out?.success === false) {
          toastMutationError(out, t("container.error.fixOpenFailed"))
          return
        }
        const startTime = out.createdAt ? new Date(out.createdAt) : new Date()
        const endTime = out.leaseEndAt
          ? new Date(out.leaseEndAt)
          : (() => {
              const e = new Date(startTime)
              e.setMonth(e.getMonth() + fixPeriod)
              return e
            })()

        const lockedPrincipalUsd =
          typeof out.principalUsd === "number" && Number.isFinite(out.principalUsd)
            ? out.principalUsd
            : netPrincipalUsd
        const seed = out.seedKey ?? `${trader.id}-${grossCommitUsd}-${fixPeriod}-${startTime.getTime()}`
        const dailySchedule = buildContainerDailySchedule(lockedPrincipalUsd, fixPeriod, seed, 0)

        const coinSymbol = out.coinSymbol ?? "BTC"
        let fixedPrice: number
        let fixedPriceFromLiveFeed = false
        if (typeof out.fixedPriceUsd === "number" && Number.isFinite(out.fixedPriceUsd)) {
          fixedPrice = out.fixedPriceUsd
        } else {
          const livePx = getSymbolPrice(coinSymbol)
          if (livePx == null) {
            fixedPrice = 0
            fixedPriceFromLiveFeed = false
          } else {
            fixedPrice = Math.round(livePx)
            fixedPriceFromLiveFeed = true
          }
        }

        const nowOpen = new Date()
        const capOpen = totalScheduleTargetUsd(dailySchedule)
        const smoothOpen = scheduledEarnedUsdSmooth(dailySchedule, startTime, nowOpen)
        const initialEarned = Math.max(0, Math.round(Math.min(capOpen, smoothOpen) * 100) / 100)

        const newTrade: ActiveFixTrade = {
          traderId: trader.id,
          amount: lockedPrincipalUsd,
          period: fixPeriod,
          startTime,
          endTime,
          earned: initialEarned,
          isLocked: true,
          canWithdrawEarnings: true,
          lastWithdrawalDate: null,
          totalWithdrawn: 0,
          dailyWithdrawUsed: 0,
          coinSymbol,
          fixedPrice,
          fixedPriceFromLiveFeed: fixedPriceFromLiveFeed ? true : undefined,
          dailySchedule,
          serverSessionId: out.sessionId,
        }
        setActiveFixTrades((prev) => [...prev, newTrade])
        addNotification({
          type: "system",
          title: t("notifications.trade.scheduleActiveTitle"),
          message: t("notifications.trade.scheduleActiveMessage")
            .replace("{{amount}}", formatUserMoney(lockedPrincipalUsd))
            .replace("{{months}}", String(fixPeriod)),
          nav: { kind: "notifications" },
        })
        setSelectedTrader(null)
      } finally {
        setIsProcessing(false)
      }
    })()
  }

  const handleEarlyExitFixTrade = async (traderId: string) => {
    const trade = activeFixTrades.find((t) => t.traderId === traderId)
    if (!trade?.serverSessionId) return

    setFixTradeActionId(traderId)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Sign in to complete early exit.")

      const res = await fetch("/api/user/fixed-trade/early-exit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId: trade.serverSessionId }),
      })
      const out = (await readJsonSafe(res)) as {
        success?: boolean
        error?: string
        settlement?: {
          agreementPenaltyUsd?: number
          insuranceExitFromPrincipalUsd?: number
          sessionEarnedUsd?: number
          netPrincipalReturnedUsd?: number
          totalCreditedToMainUsd?: number
        }
      }
      if (!res.ok || out?.success === false) {
        toastMutationError(out, "Early exit could not be completed.")
        return
      }

      setActiveFixTrades((prev) => prev.filter((t) => t.traderId !== traderId))
      const s = out.settlement
      toastMutationSuccess(
        `Early exit settled. Credited to Nexus Main: ${formatUserMoney(s?.totalCreditedToMainUsd ?? 0)} ` +
          `(full earned ${formatUserMoney(s?.sessionEarnedUsd ?? 0)} + net principal after penalties).`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Early exit failed", { duration: 6500 })
    } finally {
      setFixTradeActionId(null)
    }
  }

  const handleWithdrawEarnings = (traderId: string) => {
    void (async () => {
      const trade = activeFixTrades.find((t) => t.traderId === traderId)
      if (!trade?.serverSessionId) {
        toast.error("This fixed allocation has no funded server session — refresh the dashboard and try again.", {
          duration: 6500,
        })
        return
      }

      const grossDisplayed = fixPolicyDisplayedGrossUsd(trade)
      if (!(grossDisplayed > 0)) {
        toast.error("No accrued bullish trades are available to release yet. Bullish trades build on the desk schedule.", {
          duration: 6500,
        })
        return
      }

      const headroom = Math.max(0, Math.round((grossDisplayed - trade.totalWithdrawn) * 100) / 100)
      if (headroom <= 0) {
        toast.error(
          "Nothing left to release for this allocation — bullish trades may already be in your pocket or still accruing.",
          { duration: 7500 },
        )
        return
      }
      setFixTradeActionId(traderId)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error("Sign in to release bullish trades.")

        const res = await fetch("/api/user/fixed-trade/release-earnings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId: trade.serverSessionId }),
        })
        const raw = await readJsonSafe(res)
        const out = raw as {
          success?: boolean
          error?: string
          message?: string
          user_message?: string
          waitDays?: number
          remaining_duration_phrase?: string
          next_unlock_at?: string
          creditedLiquidUsd?: number
          releasedGrossUsd?: number
        }

        if (!res.ok || out?.success === false) {
          if (res.status === 423) {
            toast.error(
              out.user_message ||
                out.message ||
                (out.remaining_duration_phrase
                  ? `Next release unlocks in ${out.remaining_duration_phrase}. Current accrued profit continues building until then.`
                  : "This release window is locked — try again after the next unlock."),
              { duration: 9000 },
            )
            return
          }
          toastMutationError(raw, "Could not release bullish trades — try again or contact support.")
          return
        }

        const gross = Number(out.releasedGrossUsd ?? 0)
        const netLiq = Number(out.creditedLiquidUsd ?? 0)
        setActiveFixTrades((prev) =>
          prev.map((t) =>
            t.traderId === traderId
              ? {
                  ...t,
                  totalWithdrawn: t.totalWithdrawn + gross,
                  lastWithdrawalDate: new Date(),
                }
              : t,
          ),
        )
        toastMutationSuccess(
          t("funding.container.sessionToPocketToast")
            .replace("{{gross}}", formatUserMoney(gross))
            .replace("{{net}}", formatUserMoney(netLiq)),
        )
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Release failed.", { duration: 6500 })
      } finally {
        setFixTradeActionId(null)
      }
    })()
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Low": return "text-success bg-success/10"
      case "Medium": return "text-warning bg-warning/10"
      case "High": return "text-destructive bg-destructive/10"
      default: return "text-muted-foreground bg-muted"
    }
  }

  const getTraderById = (id: string) => {
    const pool = [...copyDeskCatalog, ...fixDeskCatalog]
    const direct = pool.find((t) => t.id === id)
    if (direct) return direct
    return pool.find((t) => (t.legacyIds ?? []).some((l) => l === id))
  }

  function sessionMatchesDesk(sessionTraderId: string | null | undefined, desk: MasterTrader): boolean {
    if (!sessionTraderId) return false
    if (sessionTraderId === desk.id) return true
    return (desk.legacyIds ?? []).includes(sessionTraderId)
  }

  return (
    <div ref={deskRootRef} className="nexus-container-mode space-y-4">
      {/* Live Stats Banner */}
      <Card className={cn("border-accent/30 bg-gradient-to-r from-accent/5 via-primary/5 to-success/5 p-3", MOBILE_FLAT_SURFACE)}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className={cn("flex h-2 w-2 rounded-full bg-success", MOBILE_STATIC_MOTION, "animate-pulse")} />
            <span className="text-sm font-medium">LIVE Platform Stats</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-mono font-bold">{liveStats.totalUsers.toLocaleString()}</span>
              <span className="text-muted-foreground">users</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-success" />
              <span className="font-mono font-bold text-success">+{liveStats.todayJoins.toLocaleString()}</span>
              <span className="text-muted-foreground">today</span>
            </div>
            <div className="flex items-center gap-1">
              <Lock className="h-4 w-4 text-warning" />
              <span className="font-mono font-bold">{liveStats.activeFixTrades.toLocaleString()}</span>
              <span className="text-muted-foreground">fix trades</span>
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="h-4 w-4 text-success" />
              <span className="font-mono font-bold text-success">{formatUserMoney(liveStats.totalEarnedUsd)}</span>
              <span className="text-muted-foreground">earned</span>
            </div>
          </div>
        </div>
      </Card>

      {retailerCreditSeller && userLevel === 2 && (
        <Card className="border-primary/35 bg-gradient-to-r from-primary/10 to-accent/10 p-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <Store className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 text-sm">
              <h3 className="font-semibold text-foreground">Retailer credit desk (designated Level 2)</h3>
              <p className="mt-1 text-muted-foreground">
                Your account is enabled for retailer credit operations alongside fixed trades. Keep payment collection
                details current in Dashboard → Add Funds (Level 2 retailer setup). Level 1 and Level 2 (non-designated desk)
                users submit funding with a transaction reference for your approval workflow.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Policy: up to five retailer credit accounts platform-wide — align basin limits before approving payouts.
              </p>
            </div>
          </div>
        </Card>
      )}

      {fixLiquidityGate && (
        <Card className="border-destructive/35 bg-destructive/10 p-4">
          <div className="flex gap-3 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-semibold text-destructive">Fixed trades paused — pending retailer funding</p>
              <p className="mt-1 text-muted-foreground">
                You have inbound local mobile-money approvals waiting. Unlock new fixed-trade locks once the queue clears
                (Dashboard → Add Funds → incoming requests).
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Promo Banner */}
      <Card className="border-warning/30 bg-gradient-to-r from-warning/10 to-success/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/20">
            <Trophy className="h-5 w-5 text-warning" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-warning">Grow with Container mode</h3>
                <p className="text-sm text-muted-foreground">
                  Join {liveStats.todayJoins.toLocaleString()}+ members who put capital to work with a trader they trust.
                  Your lock funds the coin so the desk can hold through quieter tape and still capture moves — earnings
                  build day by day on your Container screen for {fixPeriodDayCount(1)} / {fixPeriodDayCount(3)} /{" "}
                  {fixPeriodDayCount(6)}‑day programs, with milestones you can follow live (not a headline rate in fine
                  print).
                </p>
          </div>
          <button 
            onClick={() => setActiveTab("fix")}
            className="shrink-0 rounded-lg bg-warning px-4 py-2 text-sm font-semibold text-warning-foreground hover:bg-warning/90"
          >
            Start Now
          </button>
        </div>
      </Card>

      {/* Instructions Popup */}
      {showInstructions && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
                <Info className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-primary">Welcome to Container Mode</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Follow expert traders and automatically copy their trades. Choose between:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Copy className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <span>
                      <strong>Copy:</strong> 24h uninsured cycles — aggressive, separate risk pools from fixed insurance.
                      Force pull-out applies cancel + withdrawal + market haircut.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                    <span>
                      <strong>Fixed:</strong> Locked 1/3/6 months on the scheduled earnings curve (policy) — distinct from
                      copy-trading risk.
                    </span>
                  </li>
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Level:{" "}
                  <span className="font-semibold text-primary">
                    Level {userLevel} ({levelRequirements[userLevel]?.name ?? "Starter"})
                  </span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground border-t border-border/60 pt-2">
                  {fixedTradeTierHint(userLevel)}
                </p>
              </div>
            </div>
            <button onClick={() => setShowInstructions(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      )}

      {/* Tab Switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-semibold transition-all ${
            activeTab === "dashboard"
              ? cn("bg-gradient-to-r from-primary to-accent text-white", "max-md:bg-primary max-md:text-primary-foreground")
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <Eye className="h-4 w-4" />
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab("copy")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-semibold transition-all ${
            activeTab === "copy"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <Copy className="h-4 w-4" />
          Copy
        </button>
        <button
          onClick={() => setActiveTab("fix")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-semibold transition-all ${
            activeTab === "fix"
              ? "bg-warning text-warning-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <Lock className="h-4 w-4" />
          Fix
        </button>
      </div>

      {/* Live BTC reference — Binance spot (display only; not ledger settlement) */}
      <Card className={cn("border border-emerald-500/50 bg-gradient-to-r from-emerald-950/40 via-slate-900/80 to-slate-900/90 p-3 shadow-md sm:p-4", MOBILE_FLAT_SURFACE)}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-emerald-100">
            <BarChart3 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/90">BTC / USDT · live reference</p>
              <p className="text-[10px] text-emerald-100/70">Multi-provider market authority — display reference only; locks use spot at open.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            {btcSpotRef.status === "loading" ? (
              <span className="text-sm text-emerald-100/80">Loading spot…</span>
            ) : btcSpotRef.status === "live" ? (
              <>
                <span className="font-mono text-xl font-bold tabular-nums text-white sm:text-2xl">
                  $
                  {btcSpotRef.priceUsd.toLocaleString(undefined, {
                    minimumFractionDigits: btcSpotRef.priceUsd >= 1000 ? 0 : 2,
                    maximumFractionDigits: btcSpotRef.priceUsd >= 1000 ? 0 : 2,
                  })}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    btcSpotRef.change24hPct >= 0
                      ? "bg-emerald-500/25 text-emerald-200"
                      : "bg-rose-500/25 text-rose-100"
                  }`}
                >
                  {btcSpotRef.change24hPct >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {btcSpotRef.change24hPct >= 0 ? "+" : ""}
                  {btcSpotRef.change24hPct.toFixed(2)}% 24h
                </span>
                <span className="text-[10px] text-emerald-100/60">
                  Updated {new Date(btcSpotRef.updatedAt).toLocaleTimeString()} · {btcSpotRef.source}
                </span>
              </>
            ) : (
              <span className="text-sm text-emerald-100/80">Loading spot…</span>
            )}
          </div>
        </div>
      </Card>

      {/* ============ DASHBOARD TAB ============ */}
      {activeTab === "dashboard" && (
        <div className="space-y-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          {/* Balance Overview */}
          <Card className="overflow-hidden border-border/90 bg-card p-0">
            <div className="border-b border-border/60 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Container desk</p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight">Balance overview</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Allocation, bullish trades, and open sessions in one overview.
              </p>
            </div>
            <div className="grid gap-px bg-border/50 sm:grid-cols-3">
              <div className="bg-card p-4 sm:p-5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total allocation</p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums">{formatUserMoney(totalCryptoAllocationUsd)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Crypto committed to strategies</p>
              </div>
              <div className="bg-card p-4 sm:p-5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Bullish Trades (display)</p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-success">
                  +{formatUserMoney(totalEarnedDisplayUsd)}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  Session accruals + realized liquid (separate buckets)
                </p>
              </div>
              <div className="bg-card p-4 sm:p-5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Active trades</p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-primary">
                  {activeCopyTrades.length + activeFixTrades.length}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {activeCopyTrades.length} copy · {activeFixTrades.length} fixed
                </p>
              </div>
            </div>
          </Card>

          {/* Active Copy Trades */}
          {activeCopyTrades.length > 0 && (
            <Card className="border-border bg-card p-4">
              <h4 className="mb-3 font-semibold flex items-center gap-2">
                <Copy className="h-4 w-4 text-primary" />
                Active Copy Trades
              </h4>
              <div className="space-y-3">
                {activeCopyTrades.map((trade) => {
                  const trader = getTraderById(trade.traderId)
                  if (!trader) return null

                  return (
                    <div key={trade.traderId} className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <TraderPersonaAvatar
                              name={trader.name}
                              initials={trader.avatar}
                              riskLevel={trader.riskLevel}
                            />
                            {trade.isTrading && (
                              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                                <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-success">
                                  <RefreshCw className="h-2 w-2 text-white animate-spin" />
                                </span>
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold">{trader.name}</p>
                            <p className="text-xs text-muted-foreground">{trader.speciality}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-mono font-bold ${trade.earned >= 0 ? "text-success" : "text-destructive"}`}
                          >
                            {trade.earned >= 0 ? "+" : ""}
                            {formatUserMoney(trade.earned)}
                          </p>
                          <p className="text-xs text-muted-foreground">modeled P/L (24h desk)</p>
                        </div>
                      </div>

                      {trade.recoveryHold ? (
                        <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100">
                          Recovery hold: desk staying in position during stress — not insured. Force pull-out always
                          available.
                        </div>
                      ) : null}

                      <div className="grid grid-cols-3 gap-2 mb-3 text-center text-sm">
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Allocated (active)</p>
                          <p className="font-mono font-medium">{formatUserMoney(trade.amount)}</p>
                        </div>
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Cycle</p>
                          <p className="font-mono font-medium text-warning">{countdowns[`copy_${trade.traderId}`]}</p>
                        </div>
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Drawdown (model)</p>
                          <p className="font-mono font-medium text-muted-foreground">
                            {(trade.drawdownPct * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={trade.autoAdjust ? "default" : "outline"}
                          size="sm"
                          className="w-full"
                          onClick={() => toggleCopyAutoAdjust(trade.traderId)}
                          disabled={isProcessing}
                        >
                          Auto adjust {trade.autoAdjust ? "on" : "off"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="w-full"
                          onClick={() => setShowCancelConfirm(trade.traderId)}
                          disabled={isProcessing}
                        >
                          Force pull out
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Active Fix Trades */}
          {activeFixTrades.length > 0 && (
            <Card className="border-border bg-card p-4">
              <h4 className="mb-3 font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-warning" />
                Active Fixed Trades
              </h4>
              <div className="space-y-3">
                {activeFixTrades.map(trade => {
                  const trader = getTraderById(trade.traderId)
                  if (!trader) return null

                  return (
                    <div
                      key={trade.traderId}
                      className="relative isolate min-w-0 overflow-hidden rounded-lg border border-warning/30 bg-warning/5 p-3 sm:p-4"
                    >
                      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <TraderPersonaAvatar
                            name={trader.name}
                            initials={trader.avatar}
                            riskLevel={trader.riskLevel}
                          />
                          <div>
                            <p className="font-semibold">{trader.name}</p>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                                {trade.period} Month Fix
                              </span>
                            <div className="flex flex-col gap-0.5">
                              <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                                {trade.coinSymbol} @ ${trade.fixedPrice?.toLocaleString()}
                              </span>
                              {trade.fixedPriceFromLiveFeed ? (
                                <span className="text-[10px] font-normal leading-tight text-emerald-700 dark:text-emerald-800">
                                  Lock snapshot from live market authority at open (reference).
                                </span>
                              ) : null}
                            </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-lg">
                            <FixEarnedDisplay
                              amountUsd={fixPolicyDisplayedRemainingUsd(trade)}
                              formatUserMoney={formatUserMoney}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {trade.dailySchedule?.length
                              ? t("notifications.container.dayProgressShort")
                                  .replace(
                                    "{{current}}",
                                    String(
                                      Math.min(
                                        completedFixDaysSince(trade.startTime),
                                        fixPeriodDayCount(trade.period),
                                      ),
                                    ),
                                  )
                                  .replace("{{total}}", String(fixPeriodDayCount(trade.period)))
                              : t("notifications.container.earningsLabel")}
                          </p>
                          {trade.dailySchedule?.length ? (
                            <>
                              <div className="mt-2 h-1.5 w-full max-w-[220px] ml-auto overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-success transition-[width] duration-1000 ease-out"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      (fixPolicyDisplayedGrossUsd(trade) /
                                        Math.max(1e-9, totalScheduleTargetUsd(trade.dailySchedule))) *
                                        100
                                    )}%`,
                                  }}
                                />
                              </div>
                              {btcSpotRef.status === "live" ? (
                                <p
                                  className={`mt-1 text-[10px] ${
                                    btcSpotRef.change24hPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                  }`}
                                >
                                  Reference tone (BTC 24h): {btcSpotRef.change24hPct >= 0 ? "risk-on" : "risk-off"} — lock
                                  curve unchanged.
                                </p>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </div>

                      {trade.leaseEndedAwaitingSettlement ? (
                        <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                          {t("notifications.container.leaseSettling")}
                        </div>
                      ) : typeof trade.daysUntilMaturity === "number" ? (
                        <div className="mb-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                          {trade.daysUntilMaturity > 0 ? (
                            <span className="font-medium text-foreground">
                              {t("notifications.container.maturingIn").replace(
                                "{{n}}",
                                String(trade.daysUntilMaturity),
                              )}
                            </span>
                          ) : (
                            <span className="font-medium text-foreground">
                              {t("notifications.container.maturesToday")}
                            </span>
                          )}
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-center text-sm">
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Locked crypto allocation</p>
                          <p className="font-mono font-medium">{formatUserMoney(trade.amount)}</p>
                        </div>
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Time Left</p>
                          <p className="font-mono font-medium text-warning">{countdowns[`fix_${trade.traderId}`]}</p>
                        </div>
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">{t("container.fix.unreleasedLabel")}</p>
                          <p className="font-mono font-medium text-success">{formatUserMoney(fixUnreleasedHeadroomUsd(trade))}</p>
                        </div>
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Withdrawn</p>
                          <p className="font-mono font-medium">
                            {formatUserMoney(trade.totalWithdrawn ?? 0)}
                          </p>
                        </div>
                      </div>

                      {/* Withdrawal Info */}
                      <div className="mb-3 rounded-lg bg-background/50 p-2 text-xs">
                        <p className="text-muted-foreground leading-relaxed">{t("container.fix.releaseRulesBody")}</p>
                        {trade.lastWithdrawalDate && (
                          <div className="flex items-center justify-between text-muted-foreground mt-1">
                            <span>Last release:</span>
                            <span>{trade.lastWithdrawalDate.toLocaleDateString()}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-muted-foreground mt-1">
                          <span>{t("container.fix.availableToRelease")}:</span>
                          <span className="font-medium text-success">
                            {formatUserMoney(fixUnreleasedHeadroomUsd(trade))}
                          </span>
                        </div>
                      </div>

                      {/* Share Holding Info */}
                      <div className="mb-2 rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1">
                          <Shield className="h-3 w-3 text-primary" />
                          <span>
                            Your <strong className="text-primary">locked crypto allocation</strong> is held as{" "}
                            <strong className="text-primary">{trade.coinSymbol}</strong> reference exposure, keeping the
                            pair supported per desk policy.
                          </span>
                        </p>
                        <p className="mt-1 text-xs leading-relaxed">
                          Commission accrues per policy when <strong className="text-foreground">{trade.coinSymbol}</strong>{" "}
                          clears the lock reference{" "}
                          <strong className="font-mono text-foreground">${trade.fixedPrice?.toLocaleString()}</strong>.
                          {(() => {
                            const livePx =
                              trade.liveReferenceUsd ??
                              getSymbolPrice(trade.coinSymbol) ??
                              (trade.coinSymbol === "BTC" && btcSpotRef.status === "live"
                                ? btcSpotRef.priceUsd
                                : null)
                            if (livePx == null) return null
                            return (
                              <>
                                {" "}
                                Live market reference:{" "}
                                <strong className="font-mono text-foreground">
                                  ${livePx.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </strong>
                                .
                              </>
                            )
                          })()}{" "}
                          <span className="text-muted-foreground">Settlement follows Nexus policy, not this headline.</span>
                        </p>
                      </div>

                      <div className="mt-2 flex w-full min-w-0 flex-col gap-2.5 md:mt-3 md:flex-row md:items-stretch md:gap-3 md:pb-0">
                        {fixUnreleasedHeadroomUsd(trade) > 0 ? (
                          <Button
                            type="button"
                            variant="default"
                            size="default"
                            className="order-1 inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md border-0 bg-success px-4 text-sm font-semibold text-white shadow-sm hover:bg-success/90 focus-visible:ring-success md:order-1 md:h-10 md:flex-1"
                            onClick={() => handleWithdrawEarnings(trade.traderId)}
                            disabled={fixTradeActionId !== null}
                          >
                            {fixTradeActionId === trade.traderId ? (
                              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4 shrink-0" />
                            )}
                            <span className="whitespace-nowrap">Release bullish trades</span>
                          </Button>
                        ) : (
                          <p className="order-1 w-full rounded-md border border-dashed border-border/80 bg-background/40 px-3 py-2.5 text-center text-xs leading-snug text-muted-foreground md:order-1 md:flex-1 md:text-left">
                            {t("notifications.container.rampingHint")}
                          </p>
                        )}
                        {trade.serverSessionId ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="default"
                            className="order-2 inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md border border-amber-600/50 bg-amber-50 px-4 text-sm font-medium text-amber-950 shadow-none hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-950/50 dark:text-amber-50 dark:hover:bg-amber-950/70 md:order-2 md:h-10 md:flex-1"
                            disabled={fixTradeActionId !== null}
                            onClick={() => {
                              if (
                                confirm(
                                  t("notifications.container.earlyExitConfirm"),
                                )
                              ) {
                                void handleEarlyExitFixTrade(trade.traderId)
                              }
                            }}
                          >
                            {fixTradeActionId === trade.traderId ? (
                              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            ) : (
                              <Unlock className="h-4 w-4 shrink-0" />
                            )}
                            <span className="whitespace-nowrap">Early exit</span>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="default"
                            disabled
                            className="order-2 inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md text-muted-foreground md:h-10 md:flex-1"
                          >
                            <Lock className="h-4 w-4 shrink-0" />
                            Allocation locked
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {activeCopyTrades.length === 0 && activeFixTrades.length === 0 && (
            <Card className="border-border bg-card p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Target className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No Active Trades</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Start by selecting a trader from Copy or Fix tabs
              </p>
            </Card>
          )}
        </div>
      )}

      {/* ============ COPY TRADE TAB ============ */}
      {activeTab === "copy" && (
        <div className="space-y-4">
          <Card className="border-destructive/25 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Copy trading — higher risk (separate from fixed)</p>
                <ul className="mt-2 text-muted-foreground space-y-1.5">
                  <li>24-hour aggressive cycles; not insured — no guaranteed protection vs fixed-term container locks.</li>
                  <li>Capital may sit in recovery-hold during drawdowns; force pull-out applies fees immediately.</li>
                  <li>
                    Force exit uses modeled{" "}
                    <strong>{(COPY_TRADE_FORCE_CANCEL_FEE_RATE * 100).toFixed(1)}%</strong> cancel +{" "}
                    <strong>{(COPY_TRADE_WITHDRAW_FEE_RATE * 100).toFixed(1)}%</strong> withdrawal + adverse-move
                    haircut (final at settlement).
                  </li>
                  <li>Auto-adjust targets ~+5% then withdrawal fee — informational until execution confirms.</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* Available Traders */}
          <div className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Unlock className="h-4 w-4 text-success" />
              Available Traders ({availableTraders.length})
            </h3>
            
            {availableTraders.map((trader) => {
              const isActive = activeCopyTrades.some((t) => sessionMatchesDesk(t.traderId, trader))
              
              return (
                <Card 
                  key={trader.id}
                  className={`border-border bg-card p-4 transition-all hover:border-primary/40 cursor-pointer ${
                    isActive ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => !isActive && setSelectedTrader(trader)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <TraderPersonaAvatar
                          name={trader.name}
                          initials={trader.avatar}
                          riskLevel={trader.riskLevel}
                          size="lg"
                        />
                        {isActive && (
                          <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                            <CheckCircle2 className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{trader.name}</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRiskColor(trader.riskLevel)}`}>
                            {trader.riskLevel}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{trader.speciality}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-muted-foreground">{trader.winRate}% desk win (illustr.)</p>
                      <p className="text-xs text-muted-foreground">24h cycle · uninsured · not fixed-term insurance</p>
                    </div>
                  </div>
                  
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {trader.followers.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        {trader.totalTrades.toLocaleString()} trades
                      </span>
                    </div>
                    <Button 
                      size="sm" 
                      variant={isActive ? "outline" : "default"}
                      disabled={isActive}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!isActive) setSelectedTrader(trader)
                      }}
                    >
                      {isActive ? "Active" : <><Play className="h-3 w-3 mr-1" /> Copy</>}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Locked Traders */}
          {lockedTraders.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2 text-muted-foreground">
                <Lock className="h-4 w-4" />
                Locked Traders ({lockedTraders.length})
              </h3>
              {lockedTraders.slice(0, 4).map((trader) => (
                <Card key={trader.id} className="border-border bg-card/50 p-4 opacity-60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold">{trader.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {trader.lockReason ?? "Desk locked by operational policy."}
                        </p>
                      </div>
                    </div>
                    <p className="font-mono text-lg text-muted-foreground">+{trader.monthlyReturn}%</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ FIX TRADE TAB ============ */}
      {activeTab === "fix" && (
        <div className="space-y-4">
          <Card className="border-warning/30 bg-warning/5 p-4">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 shrink-0 text-warning" />
              <div className="text-sm">
                <p className="font-medium text-warning">{t("container.fix.releaseRulesTitle")}</p>
                <div className="mt-2 space-y-2 text-muted-foreground">
                  <p className="text-xs leading-relaxed">{t("container.fix.releaseRulesBody")}</p>
                  <p className="text-xs leading-relaxed">{t("container.fix.pocketWithdrawCap")}</p>
                </div>
                <div className="mt-3 rounded-md bg-background/40 p-2 text-xs text-muted-foreground">
                  {fixedTradeTierHint(userLevel)}
                </div>
                <div className="mt-3 pt-2 border-t border-warning/20 space-y-1 text-xs">
                  <p>- Your <strong>locked crypto allocation</strong> is held as share-style reference for the traded coin</p>
                  <p>- Your funds keep the coin alive during market dips</p>
                  <p>
                    - When the allocated pair clears the <strong className="text-foreground">reference lock level</strong>{" "}
                    on your card, commission accrues per policy. For BTC, compare that level to the{" "}
                    <strong className="text-foreground">live Binance spot strip</strong> above — display only, not a
                    settlement oracle.
                  </p>
                  <p className="text-warning">- If funds appear in main wallet early, system opted out to protect your capital</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Available Traders */}
          <div className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Unlock className="h-4 w-4 text-success" />
              Available for Fix ({fixAvailableTraders.length})
            </h3>
            
            {fixAvailableTraders.map((trader) => {
              const isActive = activeFixTrades.some((t) => sessionMatchesDesk(t.traderId, trader))
              
              return (
                <Card 
                  key={trader.id}
                  className={`border-border bg-card p-4 transition-all hover:border-warning/40 cursor-pointer ${
                    isActive ? "ring-2 ring-warning" : ""
                  }`}
                  onClick={() => !isActive && setSelectedTrader(trader)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <TraderPersonaAvatar
                          name={trader.name}
                          initials={trader.avatar}
                          riskLevel={trader.riskLevel}
                          size="lg"
                        />
                        {isActive && (
                          <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-warning text-white">
                            <Lock className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{trader.name}</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRiskColor(trader.riskLevel)}`}>
                            {trader.riskLevel}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{trader.speciality}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-success">
                        ~{trader.monthlyReturn}% / mo curve
                      </p>
                      <p className="text-xs text-muted-foreground">Scheduled bullish trades on allocation (policy)</p>
                    </div>
                  </div>
                  
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {trader.followers.toLocaleString()}
                      </span>
                    </div>
                    <Button 
                      size="sm" 
                      variant={isActive ? "outline" : "default"}
                      className={isActive ? "" : "bg-warning text-warning-foreground hover:bg-warning/90"}
                      disabled={isActive}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!isActive) setSelectedTrader(trader)
                      }}
                    >
                      {isActive ? "Locked" : <><Lock className="h-3 w-3 mr-1" /> Fix</>}
                    </Button>
                  </div>
                </Card>
              )
            })}

            {fixTierLockedTraders.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="font-semibold flex items-center gap-2 text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  Not available at your level ({fixTierLockedTraders.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  These traders stay visible for transparency. {fixedTradeTierHint(userLevel)}
                </p>
                {fixTierLockedTraders.map((trader) => (
                  <Card
                    key={`fix-locked-${trader.id}`}
                    className="border-border bg-card/60 p-4 opacity-75"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <Lock className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-semibold">{trader.name}</p>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getRiskColor(trader.riskLevel)}`}>
                            {trader.riskLevel}
                          </span>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {trader.locked && trader.lockReason
                              ? trader.lockReason
                              : userLevel <= 1
                                ? "Level 1 — Low-risk fixed traders only."
                                : userLevel === 2 && trader.riskLevel === "High"
                                  ? "Level 2 — High-risk fixed profiles require a higher account tier."
                                  : "Not available for fixed trade at your current tier."}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" disabled className="shrink-0">
                        Locked
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ TRADER SELECTION MODAL (portaled — avoids desk overflow clipping actions) ============ */}
      {deskModalMounted &&
        selectedTrader &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex flex-col bg-black/75 pt-[max(0px,env(safe-area-inset-top,0px))] sm:items-center sm:justify-center sm:bg-black/60 sm:p-4 sm:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="container-trader-modal-title"
          >
            <div
              className={cn(
                "flex min-h-0 w-full max-w-lg flex-1 flex-col gap-0 overflow-hidden rounded-t-2xl border border-border bg-card py-0 shadow-2xl",
                "max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
                "sm:max-h-[min(92dvh,760px)] sm:flex-none sm:rounded-2xl",
              )}
            >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
              <div className="flex min-w-0 items-center gap-3">
                <TraderPersonaAvatar
                  name={selectedTrader.name}
                  initials={selectedTrader.avatar}
                  riskLevel={selectedTrader.riskLevel}
                  size="lg"
                  className="h-14 w-14 text-lg"
                />
                <div className="min-w-0">
                  <h3 id="container-trader-modal-title" className="text-lg font-semibold">
                    {selectedTrader.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{selectedTrader.speciality}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTrader(null)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 [-webkit-overflow-scrolling:touch] sm:px-6">
            <p className="text-sm text-muted-foreground mb-4">{selectedTrader.description}</p>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">{activeTab === "fix" ? "Desk track (info)" : "Win rate (info)"}</p>
                <p className="text-lg font-bold text-success">{selectedTrader.winRate}%</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  {activeTab === "fix" ? "Schedule target (policy)" : "24h cycle risk"}
                </p>
                <p className="text-lg font-bold text-primary">
                  {activeTab === "fix"
                    ? fixProjectionPreview
                      ? formatUserMoney(fixProjectionPreview.totalTargetUsd)
                      : "—"
                    : "Uninsured"}
                </p>
              </div>
            </div>

            {/* Trade Settings */}
            <div className="space-y-4 border-t border-border pt-4">
              {activeTab === "copy" ? (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Allocation amount</label>
                    <SmartAmountInput
                      value={copyAmount}
                      onValueChange={setCopyAmount}
                      locale={locale}
                      currency={currency}
                      placeholder={formatLocalFiatAmount(
                        convertFromUsd(copyMinUsdPolicy, currency),
                        currency,
                        locale,
                      )}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 font-mono"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Minimum: {formatUserMoney(copyMinUsdPolicy)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm space-y-2">
                    <p className="font-medium text-destructive">Acknowledge copy-trading risk</p>
                    <ul className="list-disc pl-4 text-muted-foreground space-y-1">
                      <li>Copy desks are uninsured and uncorrelated with fixed-trade insurance pools.</li>
                      <li>24h cycles prioritize opportunity — volatility and temporary capital lock are expected.</li>
                      <li>
                        Force pull-out: {(COPY_TRADE_FORCE_CANCEL_FEE_RATE * 100).toFixed(1)}% cancel +{" "}
                        {(COPY_TRADE_WITHDRAW_FEE_RATE * 100).toFixed(1)}% withdrawal + market impact
                        {usdFromCustomerLocalInput(copyAmount, currency) >= copyMinUsdPolicy
                          ? ` (illustrative net ≈ ${formatUserMoney(
                              estimateCopyForcePulloutUsd({
                                stakeUsd: usdFromCustomerLocalInput(copyAmount, currency),
                                floatingPnLUsd: 0,
                                coinImpactFraction: 0.08,
                              }).netToMainUsd
                            )} at 8% stress)`
                          : " (enter amount for sample net)"}
                        .
                      </li>
                    </ul>
                    <label
                      htmlFor="container-copy-risk-ack"
                      className="flex min-h-[52px] cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-800 bg-white p-3.5 text-slate-900 max-md:shadow-none dark:border-slate-200 dark:bg-white dark:text-slate-900"
                    >
                      <Checkbox
                        id="container-copy-risk-ack"
                        checked={copyRiskAcknowledged}
                        onCheckedChange={(v) => setCopyRiskAcknowledged(v === true)}
                        className="mt-0.5 size-5 shrink-0 rounded border-2 border-slate-800 bg-white shadow-none ring-offset-white focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white dark:border-slate-800 dark:bg-white dark:data-[state=checked]:border-emerald-600 dark:data-[state=checked]:bg-emerald-600"
                      />
                      <span className="text-sm font-medium leading-snug">
                        I understand copy trading is high-risk, uninsured, and separate from fixed container locks.
                      </span>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Lock amount ({currency}) — managed allocation
                    </label>
                    <SmartAmountInput
                      value={fixAmount}
                      onValueChange={setFixAmount}
                      locale={locale}
                      currency={currency}
                      placeholder={formatLocalFiatAmount(
                        convertFromUsd(fixMinUsdPolicy, currency),
                        currency,
                        locale,
                      )}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 font-mono"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Minimum: {formatUserMoney(fixMinUsdPolicy)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Fix Period</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([1, 3, 6] as FixPeriod[]).map(period => (
                        <button
                          key={period}
                          onClick={() => setFixPeriod(period)}
                          className={`rounded-lg py-3 text-center font-semibold transition-all ${
                            fixPeriod === period
                              ? "bg-warning text-warning-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {period} Month{period > 1 ? "s" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Policy projection — matches container earnings schedule engine */}
                  <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Policy schedule (illustrative)
                      </span>
                      <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {fixProjectionPreview ? `${fixProjectionPreview.dayCount}d curve` : "—"}
                      </span>
                    </div>
                    {fixProjectionPreview ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total targeted bullish trades (model)</span>
                          <span className="font-mono font-semibold text-success">
                            {formatUserMoney(fixProjectionPreview.totalTargetUsd)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Illustrative day 1 accrual</span>
                          <span className="font-mono">{formatUserMoney(fixProjectionPreview.dayOneUsd)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">First week cumulative (model)</span>
                          <span className="font-mono">{formatUserMoney(fixProjectionPreview.weekOneUsd)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground pt-1">
                          Uses the same daily bucket schedule as your live fixed lock — not live coin leverage.
                          {t("container.fix.insuranceReservedHint")}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Enter an allocation amount to preview the schedule.</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground space-y-2">
                    <p className="font-semibold text-foreground">How bullish trades show up</p>
                    <p>
                      After you lock, the trader you picked trades on your behalf. Bullish trades appear as natural,
                      day‑by‑day progress — some sessions quieter, some stronger — so you can feel momentum while the
                      coin stays supported during slower periods.
                    </p>
                    <p className="text-xs">
                      Release accrued bullish trades to your pocket anytime; withdraw your full withdrawable Nexus Main balance from the dashboard (24h cooldown).
                    </p>
                  </div>

                  <div className="rounded-lg bg-warning/10 p-3 text-sm space-y-2">
                    <p className="font-medium text-warning">Fixed Trade Terms:</p>
                    <ul className="text-muted-foreground space-y-1">
                      <li>
                        - <strong>Locked crypto allocation</strong> for {fixPeriod} month{fixPeriod > 1 ? "s" : ""}. Early exit (funded
                        sessions): 10% agreement default + insurance from protected allocation only;{" "}
                        <strong>full session bullish trades</strong> credited to Nexus Main with net principal.
                      </li>
                      <li>- {t("container.fix.releaseRulesBody")}</li>
                      <li>- {t("container.fix.pocketWithdrawCap")}</li>
                    </ul>
                    <div className="pt-2 border-t border-warning/30 text-xs">
                      <p className="text-muted-foreground">
                        <strong>How it works:</strong> Your managed allocation is paired with the coin so the desk can defend
                        positions through quieter periods and still be ready when momentum returns. What you earn
                        reflects their activity and skill over the lock — you&apos;ll see it build on your Container
                        screen with day‑by‑day movement rather than a single headline number.
                      </p>
                      <p className="text-warning mt-1">
                        If you find your funds in your main wallet before the period ends, the system opted out early to protect your capital from potential losses.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

              <div className="nexus-container-desk-modal-actions sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border/80 bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] sm:-mx-6 sm:px-6">
                <div className="flex gap-3">
              <Button variant="outline" className="min-h-[48px] flex-1" onClick={() => setSelectedTrader(null)}>
                Cancel
              </Button>
              <Button
                className={`min-h-[48px] flex-1 ${activeTab === "fix" ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}`}
                onClick={() => (activeTab === "copy" ? handleActivateCopy(selectedTrader) : handleActivateFix(selectedTrader))}
                disabled={
                  isProcessing ||
                  (activeTab === "copy" && !copyRiskAcknowledged) ||
                  (activeTab === "fix" && (fixLiquidityGate || selectedTrader.locked))
                }
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...
                  </>
                ) : activeTab === "copy" ? (
                  <>
                    <Play className="h-4 w-4 mr-2" /> Start Copying
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" /> Lock & Fix
                  </>
                )}
              </Button>
                </div>
              </div>
            </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ============ CANCEL CONFIRMATION MODAL (portaled) ============ */}
      {deskModalMounted &&
        showCancelConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex flex-col bg-black/75 pt-[max(0px,env(safe-area-inset-top,0px))] sm:items-center sm:justify-center sm:bg-black/60 sm:p-4 sm:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="container-copy-cancel-title"
          >
            <div
              className={cn(
                "flex min-h-0 w-full max-w-md flex-1 flex-col gap-0 overflow-hidden rounded-t-2xl border border-destructive/30 bg-card py-0 shadow-2xl",
                "max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
                "sm:max-h-[min(88dvh,560px)] sm:flex-none sm:rounded-2xl",
              )}
            >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-5 [-webkit-overflow-scrolling:touch] sm:px-6 sm:pt-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h3 id="container-copy-cancel-title" className="text-lg font-semibold">
                Force pull out?
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Applies {(COPY_TRADE_FORCE_CANCEL_FEE_RATE * 100).toFixed(1)}% cancel +{" "}
                {(COPY_TRADE_WITHDRAW_FEE_RATE * 100).toFixed(1)}% withdrawal + modeled coin impact. Final amount confirms
                after execution.
              </p>
              {(() => {
                const trade = activeCopyTrades.find((t) => t.traderId === showCancelConfirm)
                if (!trade) return null
                const est = estimateCopyForcePulloutUsd({
                  stakeUsd: trade.amount,
                  floatingPnLUsd: trade.earned,
                  coinImpactFraction: trade.drawdownPct,
                })
                return (
                  <div className="mt-4 rounded-lg bg-muted p-3 text-sm space-y-1 text-left">
                    <div className="flex justify-between">
                      <span>Allocated principal</span>
                      <span>{formatUserMoney(trade.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Modeled P/L</span>
                      <span>{formatUserMoney(trade.earned)}</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>Cancel fee</span>
                      <span>-{formatUserMoney(est.cancelFeeUsd)}</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>Withdrawal fee</span>
                      <span>-{formatUserMoney(est.withdrawFeeUsd)}</span>
                    </div>
                    <div className="flex justify-between font-bold mt-2 border-t border-border pt-2">
                      <span>Est. net</span>
                      <span>{formatUserMoney(est.netToMainUsd)}</span>
                    </div>
                  </div>
                )
              })()}
            </div>

              <div className="nexus-container-desk-modal-actions sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border/80 bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] sm:-mx-6 sm:px-6">
                <div className="flex gap-3">
                  <Button variant="outline" className="min-h-[48px] flex-1" onClick={() => setShowCancelConfirm(null)}>
                    Keep Trading
                  </Button>
                  <Button
                    variant="destructive"
                    className="min-h-[48px] flex-1"
                    onClick={() => handleForcePullOutCopy(showCancelConfirm)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm pull out"}
                  </Button>
                </div>
              </div>
            </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
