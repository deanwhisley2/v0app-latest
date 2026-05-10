"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { supabase } from "@/lib/supabaseClient"
import {
  buildContainerDailySchedule,
  completedFixDaysSince,
  fixPeriodDayCount,
  scheduledEarnedUsd,
} from "@/lib/container-earnings-schedule"
import { traderEligibleForFixedTrade, fixedTradeTierHint } from "@/lib/fix-trade-access"
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
  Ban,
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
}

interface ActiveCopyTrade {
  traderId: string
  amount: number
  startTime: Date
  minEndTime: Date // 24 hours minimum
  earned: number
  isTrading: boolean
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
  withdrawablePercent: number // Based on period: 1m=30%, 3m=50%, 6m=70%
  dailyWithdrawUsed: number // For 6-month users 10% daily option
  coinSymbol: string // The coin this trade is fixed on
  fixedPrice: number // Price at which it was fixed
  /** Platform-deposit container: random positive daily buckets that sum to an internal schedule target (server-side). */
  dailySchedule?: number[]
  /** When set, early pullout is processed via POST /api/user/fixed-trade/early-exit (funded server session). */
  serverSessionId?: string
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

// Master traders (automation personas with human names)
const masterTraders: MasterTrader[] = [
  {
    id: "tr_001",
    name: "Marcus Chen",
    avatar: "MC",
    winRate: 78.5,
    totalProfit: 245000,
    followers: 12453,
    totalTrades: 3421,
    riskLevel: "Low",
    speciality: "BTC/ETH Long-term",
    minLevel: 1,
    status: "active",
    monthlyReturn: 12.4,
    maxDrawdown: 8.2,
    description: "Conservative trader focused on major pairs with strong fundamentals. Known for consistent returns with minimal risk.",
    strategies: ["DOW Theory", "Supply & Demand", "Weekly Structure"]
  },
  {
    id: "tr_002",
    name: "Sarah Williams",
    avatar: "SW",
    winRate: 82.1,
    totalProfit: 518000,
    followers: 28901,
    totalTrades: 5672,
    riskLevel: "Medium",
    speciality: "Scalping Expert",
    minLevel: 1,
    status: "active",
    monthlyReturn: 18.7,
    maxDrawdown: 12.5,
    description: "High-frequency trader specializing in quick scalps. Uses advanced momentum strategies for rapid gains.",
    strategies: ["FVG", "Liquidity Sweep", "8AM Range"]
  },
  {
    id: "tr_003",
    name: "James Rodriguez",
    avatar: "JR",
    winRate: 71.3,
    totalProfit: 892000,
    followers: 45231,
    totalTrades: 8934,
    riskLevel: "High",
    speciality: "Altcoin Hunter",
    minLevel: 1,
    status: "active",
    monthlyReturn: 34.2,
    maxDrawdown: 22.1,
    description: "Aggressive altcoin trader who finds gems before they pump. Higher risk but exceptional rewards.",
    strategies: ["AMD Strategy", "Smart Money Following", "Breakout Plays"]
  },
  {
    id: "tr_004",
    name: "Elena Volkov",
    avatar: "EV",
    winRate: 85.7,
    totalProfit: 1250000,
    followers: 67892,
    totalTrades: 4521,
    riskLevel: "Low",
    speciality: "Swing Trading",
    minLevel: 1,
    status: "active",
    monthlyReturn: 15.3,
    maxDrawdown: 6.8,
    description: "Elite swing trader with institutional-grade analysis. Holds positions for days to weeks for optimal entries.",
    strategies: ["Weekly Sweep CHoCH", "Direction Location Risk", "Order Blocks"]
  },
  {
    id: "tr_005",
    name: "David Kim",
    avatar: "DK",
    winRate: 76.9,
    totalProfit: 678000,
    followers: 34521,
    totalTrades: 6789,
    riskLevel: "Medium",
    speciality: "DeFi Expert",
    minLevel: 1,
    status: "active",
    monthlyReturn: 21.8,
    maxDrawdown: 15.3,
    description: "DeFi specialist who navigates yield farming and DEX trades. Deep understanding of on-chain dynamics.",
    strategies: ["Value Area", "Liquidity Analysis", "On-chain Signals"]
  },
  {
    id: "tr_006",
    name: "Olivia Thompson",
    avatar: "OT",
    winRate: 88.2,
    totalProfit: 1890000,
    followers: 89234,
    totalTrades: 3245,
    riskLevel: "Low",
    speciality: "Index Trading",
    minLevel: 1,
    status: "active",
    monthlyReturn: 14.1,
    maxDrawdown: 5.2,
    description: "Former Wall Street quant now trading crypto. Mathematical precision with risk-adjusted returns.",
    strategies: ["Statistical Arbitrage", "Mean Reversion", "Correlation Trading"]
  },
  {
    id: "tr_007",
    name: "Alex Nakamoto",
    avatar: "AN",
    winRate: 79.4,
    totalProfit: 2340000,
    followers: 112453,
    totalTrades: 12456,
    riskLevel: "Medium",
    speciality: "News Trading",
    minLevel: 1,
    status: "active",
    monthlyReturn: 28.9,
    maxDrawdown: 18.7,
    description: "Lightning-fast news trader who capitalizes on market-moving events. 24/7 monitoring of global crypto news.",
    strategies: ["Event-Driven", "Sentiment Analysis", "Volume Spikes"]
  },
  {
    id: "tr_008",
    name: "Isabella Santos",
    avatar: "IS",
    winRate: 91.3,
    totalProfit: 3120000,
    followers: 156789,
    totalTrades: 2134,
    riskLevel: "Low",
    speciality: "Whale Tracking",
    minLevel: 1,
    status: "active",
    monthlyReturn: 19.6,
    maxDrawdown: 4.1,
    description: "Tracks institutional wallets and whale movements. Follows the smart money for reliable entries.",
    strategies: ["Whale Alert", "Institutional Flow", "Accumulation Detection"]
  },
  {
    id: "tr_009",
    name: "Victor Petrov",
    avatar: "VP",
    winRate: 74.8,
    totalProfit: 4560000,
    followers: 201234,
    totalTrades: 18923,
    riskLevel: "High",
    speciality: "Leverage Master",
    minLevel: 1,
    status: "active",
    monthlyReturn: 45.2,
    maxDrawdown: 28.4,
    description: "Elite leverage trader using up to 50x. Extremely high risk but legendary returns for experienced users.",
    strategies: ["High Leverage", "Liquidation Hunting", "Funding Rate Arbitrage"]
  },
  {
    id: "tr_010",
    name: "Grace Liu",
    avatar: "GL",
    winRate: 93.7,
    totalProfit: 5890000,
    followers: 287654,
    totalTrades: 1567,
    riskLevel: "Low",
    speciality: "Joelin-assisted",
    minLevel: 1,
    status: "active",
    monthlyReturn: 22.3,
    maxDrawdown: 3.2,
    description: "Uses proprietary multi-strategy engines combining 16+ models. Advanced desk-grade execution.",
    strategies: ["Multi-strategy stack", "Deep learning layer", "Adaptive risk"]
  },
]

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
}

export function ContainerMode({
  userLevel = 1,
  retailerCreditSeller = false,
  retailerLiquidityOpsBlocked = false,
}: ContainerModeProps) {
  const { formatUserMoney } = useUserPreferences()
  const [activeTab, setActiveTab] = useState<ContainerTab>("dashboard")
  const [selectedTrader, setSelectedTrader] = useState<MasterTrader | null>(null)
  const [showInstructions, setShowInstructions] = useState(true)
  const [copyAmount, setCopyAmount] = useState("500")
  const [fixAmount, setFixAmount] = useState("1000")
  const [fixPeriod, setFixPeriod] = useState<FixPeriod>(1)
  const [riskMultiplier, setRiskMultiplier] = useState(1)
  const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Active trades state
  const [activeCopyTrades, setActiveCopyTrades] = useState<ActiveCopyTrade[]>([
    {
      traderId: "tr_001",
      amount: 500,
      startTime: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
      minEndTime: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
      earned: 23.45,
      isTrading: true,
    }
  ])

  const [activeFixTrades, setActiveFixTrades] = useState<ActiveFixTrade[]>(() => {
    const traderId = "tr_001"
    const amount = 2000
    const period = 3 as FixPeriod
    const startTime = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
    const endTime = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
    const seed = `${traderId}-${amount}-${period}-${startTime.getTime()}`
    const dailySchedule = buildContainerDailySchedule(amount, period, seed)
    const earned = scheduledEarnedUsd(dailySchedule, startTime)
    return [
      {
        traderId,
        amount,
        period,
        startTime,
        endTime,
        earned,
        isLocked: true,
        canWithdrawEarnings: true,
        lastWithdrawalDate: null,
        totalWithdrawn: 0,
        withdrawablePercent: 50,
        dailyWithdrawUsed: 0,
        coinSymbol: "BTC",
        fixedPrice: 67500,
        dailySchedule,
      },
    ]
  })

  // Countdown timer effect
  const [countdowns, setCountdowns] = useState<Record<string, string>>({})
  
  // Live preview simulation for Fix Trade
  const [livePreview, setLivePreview] = useState({
    coinSymbol: "BTC",
    basePrice: 67500,
    currentPrice: 67500,
    priceChange: 0,
    earnings: 0,
    isPositive: true,
  })

  // Live user join stats
  const [liveStats, setLiveStats] = useState({
    totalUsers: 287654,
    todayJoins: 1247,
    activeFixTrades: 42891,
    totalEarned: 12500000,
  })

  const joinNotificationLines = useMemo(() => {
    const m = (usd: number) => formatUserMoney(usd)
    return [
      () => `John D. from Nigeria just joined Fix Trade with ${m(2000)}`,
      () => `Mary K. from Kenya started Copy Trading Marcus Chen`,
      () => `Peter M. from Uganda fixed ${m(5000)} for 6 months`,
      () => `Alice N. from Tanzania earned ${m(340)} today!`,
      () => `Michael O. from Ghana joined with ${m(1500)}`,
      () => `Sandra L. from South Africa started following Elena Rodriguez`,
    ]
  }, [formatUserMoney])

  const [joinNotifMessage, setJoinNotifMessage] = useState("")
  const [showJoinNotif, setShowJoinNotif] = useState(false)

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

    updateCountdowns()
    const interval = setInterval(updateCountdowns, 1000)
    return () => clearInterval(interval)
  }, [activeCopyTrades, activeFixTrades])

  // Simulate earnings increase
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCopyTrades(trades => trades.map(trade => ({
        ...trade,
        earned: trade.earned + (Math.random() * 0.5 - 0.1),
        isTrading: Math.random() > 0.3,
      })))

      setActiveFixTrades((trades) =>
        trades.map((trade) =>
          trade.dailySchedule?.length
            ? trade
            : {
                ...trade,
                earned: trade.earned + (Math.random() * 2),
              }
        )
      )

      // Update live stats
      setLiveStats(prev => ({
        ...prev,
        todayJoins: prev.todayJoins + Math.floor(Math.random() * 3),
        activeFixTrades: prev.activeFixTrades + Math.floor(Math.random() * 5),
        totalEarned: prev.totalEarned + Math.floor(Math.random() * 500),
      }))
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  // Keep fixed-trade earnings aligned with the locked-period daily curve (container / platform deposit).
  useEffect(() => {
    const sync = () => {
      setActiveFixTrades((trades) =>
        trades.map((trade) => {
          if (!trade.dailySchedule?.length) return trade
          const next = scheduledEarnedUsd(trade.dailySchedule, trade.startTime)
          return next !== trade.earned ? { ...trade, earned: next } : trade
        })
      )
    }
    sync()
    const id = window.setInterval(sync, 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Small bottom join notifications (amounts in user currency)
  useEffect(() => {
    const showNotif = () => {
      const pickers = joinNotificationLines
      const line = pickers[Math.floor(Math.random() * pickers.length)]?.() ?? ""
      setJoinNotifMessage(line)
      setShowJoinNotif(true)
      setTimeout(() => setShowJoinNotif(false), 4000)
    }

    const initialTimeout = setTimeout(showNotif, 5000)
    const interval = setInterval(showNotif, 15000 + Math.random() * 10000)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [joinNotificationLines])

  // Live preview simulation for Fix Trade modal
  useEffect(() => {
    if (!selectedTrader || activeTab !== "fix") return

    const coins = [
      { symbol: "BTC", price: 67500 },
      { symbol: "ETH", price: 3450 },
      { symbol: "SOL", price: 142 },
      { symbol: "BNB", price: 580 },
      { symbol: "AVAX", price: 35 },
    ]
    
    // Pick a random coin for this preview
    const randomCoin = coins[Math.floor(Math.random() * coins.length)]
    setLivePreview(prev => ({
      ...prev,
      coinSymbol: randomCoin.symbol,
      basePrice: randomCoin.price,
      currentPrice: randomCoin.price,
    }))

    // Simulate real-time price movement
    const interval = setInterval(() => {
      setLivePreview(prev => {
        // Simulate price volatility (-1.5% to +1.5%)
        const changePercent = (Math.random() - 0.48) * 3
        const newPrice = prev.basePrice * (1 + changePercent / 100)
        const totalChangePercent = ((newPrice - prev.basePrice) / prev.basePrice) * 100
        
        // Calculate earnings based on amount and price change
        const amount = parseFloat(fixAmount) || 0
        const earnings = (amount * totalChangePercent) / 100
        
        return {
          ...prev,
          currentPrice: newPrice,
          priceChange: totalChangePercent,
          earnings: earnings,
          isPositive: totalChangePercent >= 0,
        }
      })
    }, 1500)

    return () => clearInterval(interval)
  }, [selectedTrader, activeTab, fixAmount])

  const availableTraders = masterTraders.filter((t) => t.minLevel <= userLevel)
  const lockedTraders = masterTraders.filter((t) => t.minLevel > userLevel)

  const fixLiquidityGate = userLevel === 2 && retailerLiquidityOpsBlocked
  const fixAvailableTraders = masterTraders.filter(
    (t) => t.minLevel <= userLevel && traderEligibleForFixedTrade(userLevel, t.riskLevel)
  )
  const fixTierLockedTraders = masterTraders.filter(
    (t) => t.minLevel <= userLevel && !traderEligibleForFixedTrade(userLevel, t.riskLevel)
  )

  const totalStaked = activeCopyTrades.reduce((sum, t) => sum + t.amount, 0) + 
                      activeFixTrades.reduce((sum, t) => sum + t.amount, 0)
  const totalEarned = activeCopyTrades.reduce((sum, t) => sum + t.earned, 0) + 
                      activeFixTrades.reduce((sum, t) => sum + t.earned, 0)

  const handleActivateCopy = (trader: MasterTrader) => {
    const amount = parseFloat(copyAmount)
    if (isNaN(amount) || amount <= 0) return

    setIsProcessing(true)
    setTimeout(() => {
      const newTrade: ActiveCopyTrade = {
        traderId: trader.id,
        amount,
        startTime: new Date(),
        minEndTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours minimum
        earned: 0,
        isTrading: true,
      }
      setActiveCopyTrades([...activeCopyTrades, newTrade])
      setSelectedTrader(null)
      setIsProcessing(false)
    }, 1500)
  }

  const handleActivateFix = (trader: MasterTrader) => {
    const amount = parseFloat(fixAmount)
    if (isNaN(amount) || amount <= 0) return
    if (!traderEligibleForFixedTrade(userLevel, trader.riskLevel)) return

    setIsProcessing(true)
    setTimeout(() => {
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + fixPeriod)

      // Withdrawal percentages based on period
      const withdrawPercent = fixPeriod === 1 ? 30 : fixPeriod === 3 ? 50 : 70
      
      // Random coin for this fix trade
      const coins = ["BTC", "ETH", "SOL", "AVAX", "BNB"]
      const coinSymbol = coins[Math.floor(Math.random() * coins.length)]
      const coinPrices: Record<string, number> = { BTC: 67500, ETH: 3450, SOL: 142, AVAX: 35, BNB: 580 }
      const startTime = new Date()
      const seed = `${trader.id}-${amount}-${fixPeriod}-${startTime.getTime()}`
      const dailySchedule = buildContainerDailySchedule(amount, fixPeriod, seed)

      const newTrade: ActiveFixTrade = {
        traderId: trader.id,
        amount,
        period: fixPeriod,
        startTime,
        endTime: endDate,
        earned: 0,
        isLocked: true,
        canWithdrawEarnings: fixPeriod >= 3,
        lastWithdrawalDate: null,
        totalWithdrawn: 0,
        withdrawablePercent: withdrawPercent,
        dailyWithdrawUsed: 0,
        coinSymbol,
        fixedPrice: coinPrices[coinSymbol] || 1000,
        dailySchedule,
      }
      setActiveFixTrades([...activeFixTrades, newTrade])
      setSelectedTrader(null)
      setIsProcessing(false)
    }, 1500)
  }

  const handleCancelCopyTrade = (traderId: string) => {
    const trade = activeCopyTrades.find(t => t.traderId === traderId)
    if (!trade) return

    const canCancel = Date.now() >= trade.minEndTime.getTime()
    if (!canCancel) {
      alert("Cannot cancel before 24 hours minimum period")
      return
    }

    // 10% stake + 1.6% reverse fee
    const cancellationFee = trade.amount * 0.10 + trade.amount * 0.016
    const returnAmount = trade.amount + trade.earned - cancellationFee

    setIsProcessing(true)
    setTimeout(() => {
      setActiveCopyTrades(activeCopyTrades.filter(t => t.traderId !== traderId))
      setShowCancelConfirm(null)
      setIsProcessing(false)
      alert(
        `Trade cancelled. Returned: ${formatUserMoney(returnAmount)} (Fee: ${formatUserMoney(cancellationFee)})`
      )
    }, 1500)
  }

  const handleEarlyExitFixTrade = async (traderId: string) => {
    const trade = activeFixTrades.find((t) => t.traderId === traderId)
    if (!trade?.serverSessionId) return

    setIsProcessing(true)
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
      const out = (await res.json().catch(() => ({}))) as {
        error?: string
        settlement?: {
          agreementPenaltyUsd?: number
          insuranceExitFromPrincipalUsd?: number
          sessionEarnedUsd?: number
          netPrincipalReturnedUsd?: number
          totalCreditedToMainUsd?: number
        }
      }
      if (!res.ok) throw new Error(out.error || "Early exit failed")

      setActiveFixTrades((prev) => prev.filter((t) => t.traderId !== traderId))
      const s = out.settlement
      alert(
        `Early pullout settled. Credited to Nexus Main: ${formatUserMoney(s?.totalCreditedToMainUsd ?? 0)} ` +
          `(full earned ${formatUserMoney(s?.sessionEarnedUsd ?? 0)} + net principal after penalties).`
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : "Early exit failed")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleWithdrawEarnings = (traderId: string, withdrawAmount?: number) => {
    const trade = activeFixTrades.find(t => t.traderId === traderId)
    if (!trade || !trade.canWithdrawEarnings || trade.earned <= 0) return

    // Calculate withdrawable amount based on period rules
    // 1 month: 30% every 5 days
    // 3 months: 50% every 5 days
    // 6 months: 70% every 5 days OR 10% daily (counts against 70%)
    const maxWithdrawablePercent = trade.withdrawablePercent
    const maxWithdrawable = (trade.earned * maxWithdrawablePercent / 100) - trade.totalWithdrawn
    
    // Check 5-day rule
    const daysSinceLastWithdraw = trade.lastWithdrawalDate 
      ? Math.floor((Date.now() - trade.lastWithdrawalDate.getTime()) / (1000 * 60 * 60 * 24))
      : 999
    
    // For 6-month users, allow 10% daily
    const canWithdrawDaily = trade.period === 6 && daysSinceLastWithdraw >= 1
    const canWithdraw5Day = daysSinceLastWithdraw >= 5
    
    if (!canWithdrawDaily && !canWithdraw5Day && trade.lastWithdrawalDate) {
      const daysRemaining = trade.period === 6 ? 1 - daysSinceLastWithdraw : 5 - daysSinceLastWithdraw
      alert(`Please wait ${Math.max(1, daysRemaining)} more day(s) before your next withdrawal.`)
      return
    }

    // Calculate actual withdrawal amount
    let toWithdraw = withdrawAmount || maxWithdrawable
    if (trade.period === 6 && canWithdrawDaily && !canWithdraw5Day) {
      // Daily 10% withdrawal for 6-month users
      toWithdraw = Math.min(toWithdraw, trade.earned * 0.10)
    }
    toWithdraw = Math.min(toWithdraw, maxWithdrawable, trade.earned)
    
    if (toWithdraw <= 0) {
      alert("No earnings available to withdraw at this time. You've reached your withdrawal limit for this period.")
      return
    }

    setIsProcessing(true)
    setTimeout(() => {
      setActiveFixTrades(activeFixTrades.map(t => 
        t.traderId === traderId 
          ? { 
              ...t, 
              earned: t.earned - toWithdraw, 
              totalWithdrawn: t.totalWithdrawn + toWithdraw,
              lastWithdrawalDate: new Date(),
              dailyWithdrawUsed: t.period === 6 ? t.dailyWithdrawUsed + toWithdraw : 0
            } 
          : t
      ))
      setIsProcessing(false)
      alert(
        `Withdrawn ${formatUserMoney(toWithdraw)} to your main wallet. Remaining earnings: ${formatUserMoney(trade.earned - toWithdraw)}`
      )
    }, 1500)
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Low": return "text-success bg-success/10"
      case "Medium": return "text-warning bg-warning/10"
      case "High": return "text-destructive bg-destructive/10"
      default: return "text-muted-foreground bg-muted"
    }
  }

  const getTraderById = (id: string) => masterTraders.find(t => t.id === id)

  return (
    <div className="space-y-4">
      {/* Join Notification Popup - Bottom Left */}
      {showJoinNotif && (
        <div className="fixed bottom-20 left-4 z-50 animate-in slide-in-from-left duration-300">
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-card px-4 py-3 shadow-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/20">
              <Users className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-sm font-medium">{joinNotifMessage}</p>
              <p className="text-xs text-muted-foreground">Just now</p>
            </div>
            <button onClick={() => setShowJoinNotif(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Live Stats Banner */}
      <Card className="border-accent/30 bg-gradient-to-r from-accent/5 via-primary/5 to-success/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-2 w-2 animate-pulse rounded-full bg-success" />
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
              <span className="font-mono font-bold text-success">{formatUserMoney(liveStats.totalEarned)}</span>
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
                  <li className="flex items-center gap-2">
                    <Copy className="h-3 w-3 text-primary" />
                    <strong>Copy Trade:</strong> Real-time copying, min 24hrs, can cancel with 10% + 1.6% fee
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="h-3 w-3 text-warning" />
                    <strong>Fix Trade:</strong> Fixed period (1/3/6 months), funds locked — more time for your trader to work the plan
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
              ? "bg-gradient-to-r from-primary to-accent text-white"
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

      {/* ============ DASHBOARD TAB ============ */}
      {activeTab === "dashboard" && (
        <div className="space-y-4">
          {/* Balance Overview */}
          <Card className="border-border bg-gradient-to-br from-card to-primary/5 p-6">
            <h3 className="mb-4 text-lg font-semibold">Container Balance</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-background/50 p-4 text-center">
                <p className="text-sm text-muted-foreground">Total Staked</p>
                <p className="mt-1 font-mono text-2xl font-bold">{formatUserMoney(totalStaked)}</p>
              </div>
              <div className="rounded-xl bg-success/10 p-4 text-center">
                <p className="text-sm text-muted-foreground">Total Earned</p>
                <p className="mt-1 font-mono text-2xl font-bold text-success">+{formatUserMoney(totalEarned)}</p>
              </div>
              <div className="rounded-xl bg-primary/10 p-4 text-center">
                <p className="text-sm text-muted-foreground">Active Trades</p>
                <p className="mt-1 font-mono text-2xl font-bold text-primary">
                  {activeCopyTrades.length + activeFixTrades.length}
                </p>
                <p className="text-xs text-muted-foreground">{activeCopyTrades.length} copy, {activeFixTrades.length} fixed</p>
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
                {activeCopyTrades.map(trade => {
                  const trader = getTraderById(trade.traderId)
                  if (!trader) return null
                  const canCancel = Date.now() >= trade.minEndTime.getTime()

                  return (
                    <div key={trade.traderId} className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div 
                              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                              style={{ backgroundColor: trader.riskLevel === "Low" ? "#22C55E" : trader.riskLevel === "Medium" ? "#EAB308" : "#EF4444" }}
                            >
                              {trader.avatar}
                            </div>
                            {trade.isTrading && (
                              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
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
                          <p className="font-mono font-bold text-success">+{formatUserMoney(trade.earned)}</p>
                          <p className="text-xs text-muted-foreground">earned</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3 text-center text-sm">
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Staked</p>
                          <p className="font-mono font-medium">{formatUserMoney(trade.amount)}</p>
                        </div>
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Time Left</p>
                          <p className="font-mono font-medium text-warning">{countdowns[`copy_${trade.traderId}`]}</p>
                        </div>
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Status</p>
                          <p className={`font-medium ${trade.isTrading ? "text-success" : "text-muted-foreground"}`}>
                            {trade.isTrading ? "Trading" : "Waiting"}
                          </p>
                        </div>
                      </div>

                      {canCancel ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full text-destructive hover:bg-destructive/10"
                          onClick={() => setShowCancelConfirm(trade.traderId)}
                        >
                          <Ban className="h-3 w-3 mr-1" />
                          Cancel Trade (10% + 1.6% fee)
                        </Button>
                      ) : (
                        <p className="text-center text-xs text-muted-foreground">
                          <Lock className="inline h-3 w-3 mr-1" />
                          Locked for 24hr minimum
                        </p>
                      )}
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
                    <div key={trade.traderId} className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div 
                            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                            style={{ backgroundColor: trader.riskLevel === "Low" ? "#22C55E" : trader.riskLevel === "Medium" ? "#EAB308" : "#EF4444" }}
                          >
                            {trader.avatar}
                          </div>
                          <div>
                            <p className="font-semibold">{trader.name}</p>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                                {trade.period} Month Fix
                              </span>
                              <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                                {trade.coinSymbol} @ ${trade.fixedPrice?.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-lg">
                            <FixEarnedDisplay amountUsd={trade.earned} formatUserMoney={formatUserMoney} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {trade.dailySchedule?.length
                              ? `Day ${Math.min(completedFixDaysSince(trade.startTime), fixPeriodDayCount(trade.period))} / ${fixPeriodDayCount(trade.period)} · curve`
                              : "Earnings"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-center text-sm">
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Staked (Frozen)</p>
                          <p className="font-mono font-medium">{formatUserMoney(trade.amount)}</p>
                        </div>
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Time Left</p>
                          <p className="font-mono font-medium text-warning">{countdowns[`fix_${trade.traderId}`]}</p>
                        </div>
                        <div className="rounded bg-background p-2">
                          <p className="text-xs text-muted-foreground">Withdrawable</p>
                          <p className="font-mono font-medium text-success">{trade.withdrawablePercent}%</p>
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
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Withdrawal Schedule:</span>
                          <span className="font-medium text-foreground">
                            {trade.period === 1 && "30% every 5 days"}
                            {trade.period === 3 && "50% every 5 days"}
                            {trade.period === 6 && "70% every 5 days or 10% daily"}
                          </span>
                        </div>
                        {trade.lastWithdrawalDate && (
                          <div className="flex items-center justify-between text-muted-foreground mt-1">
                            <span>Last Withdrawal:</span>
                            <span>{trade.lastWithdrawalDate.toLocaleDateString()}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-muted-foreground mt-1">
                          <span>Available to Withdraw:</span>
                          <span className="font-medium text-success">
                            {formatUserMoney(
                              Math.max(
                                0,
                                (trade.earned * trade.withdrawablePercent) / 100 - (trade.totalWithdrawn || 0)
                              )
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Share Holding Info */}
                      <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1">
                          <Shield className="h-3 w-3 text-primary" />
                          <span>Your stake is frozen as <strong className="text-primary">{trade.coinSymbol}</strong> share holding, keeping the coin supported.</span>
                        </p>
                        <p className="mt-1">Commission earned when {trade.coinSymbol} rises above ${trade.fixedPrice?.toLocaleString()}.</p>
                      </div>

                      <div className="flex gap-2">
                        {trade.earned > 0 ? (
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="flex-1 bg-success hover:bg-success/90"
                            onClick={() => handleWithdrawEarnings(trade.traderId)}
                            disabled={isProcessing}
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <ArrowUpRight className="h-3 w-3 mr-1" />
                            )}
                            Withdraw Earnings
                          </Button>
                        ) : (
                          <p className="flex-1 text-center text-xs text-muted-foreground py-2">
                            No earnings yet - generating based on {trade.coinSymbol} movement
                          </p>
                        )}
                        {trade.serverSessionId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-warning text-warning hover:bg-warning/10"
                            disabled={isProcessing}
                            onClick={() => {
                              if (
                                confirm(
                                  "Early pullout before lease end? You pay 10% agreement default + insurance (from stake only). Session earnings are credited in full to Nexus Main.",
                                )
                              ) {
                                void handleEarlyExitFixTrade(trade.traderId)
                              }
                            }}
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Unlock className="h-3 w-3 mr-1" />
                            )}
                            Early pullout
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled className="text-muted-foreground">
                            <Lock className="h-3 w-3 mr-1" />
                            Stake Frozen
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
          <Card className="border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-primary" />
              <div className="text-sm">
                <p className="font-medium">Copy Trade Rules</p>
                <ul className="mt-1 text-muted-foreground space-y-1">
                  <li>- Minimum 24 hours before you can cancel</li>
                  <li>- Cancellation fee: 10% of stake + 1.6% reverse fee</li>
                  <li>- Real-time trade mirroring with your chosen allocation</li>
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
              const isActive = activeCopyTrades.some(t => t.traderId === trader.id)
              
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
                        <div 
                          className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                          style={{ backgroundColor: trader.riskLevel === "Low" ? "#22C55E" : trader.riskLevel === "Medium" ? "#EAB308" : "#EF4444" }}
                        >
                          {trader.avatar}
                        </div>
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
                      <p className="font-mono text-lg font-bold text-success">+{trader.monthlyReturn}%</p>
                      <p className="text-xs text-muted-foreground">{trader.winRate}% Win Rate</p>
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
              {lockedTraders.slice(0, 2).map((trader) => (
                <Card key={trader.id} className="border-border bg-card/50 p-4 opacity-60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold">{trader.name}</p>
                        <p className="text-xs text-muted-foreground">Level {trader.minLevel} Required</p>
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
                <p className="font-medium text-warning">Fixed Trade Rules & Withdrawal Schedule</p>
                <div className="mt-2 space-y-2 text-muted-foreground">
                  <div className="rounded-lg bg-background/50 p-2">
                    <p className="font-medium text-foreground text-xs">1 Month Fix</p>
                    <p className="text-xs">- Withdraw up to <strong className="text-success">30%</strong> of earnings every 5 days</p>
                  </div>
                  <div className="rounded-lg bg-background/50 p-2">
                    <p className="font-medium text-foreground text-xs">3 Month Fix</p>
                    <p className="text-xs">- Withdraw up to <strong className="text-success">50%</strong> of earnings every 5 days</p>
                  </div>
                  <div className="rounded-lg bg-background/50 p-2">
                    <p className="font-medium text-foreground text-xs">6 Month Fix</p>
                    <p className="text-xs">- Withdraw up to <strong className="text-success">70%</strong> of earnings every 5 days</p>
                    <p className="text-xs">- OR <strong className="text-primary">10% daily</strong> (counts toward 70% limit)</p>
                  </div>
                </div>
                <div className="mt-3 rounded-md bg-background/40 p-2 text-xs text-muted-foreground">
                  {fixedTradeTierHint(userLevel)}
                </div>
                <div className="mt-3 pt-2 border-t border-warning/20 space-y-1 text-xs">
                  <p>- Your stake is <strong>FROZEN</strong> as share holding for the traded coin</p>
                  <p>- Your funds keep the coin alive during market dips</p>
                  <p>- When coin rises above fixed price, you earn commission without affecting shares</p>
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
              const isActive = activeFixTrades.some(t => t.traderId === trader.id)
              
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
                        <div 
                          className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                          style={{ backgroundColor: trader.riskLevel === "Low" ? "#22C55E" : trader.riskLevel === "Medium" ? "#EAB308" : "#EF4444" }}
                        >
                          {trader.avatar}
                        </div>
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
                      <p className="font-mono text-lg font-bold text-success">+{(trader.monthlyReturn * 1.2).toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Fixed bonus +20%</p>
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
                            {userLevel <= 1
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

      {/* ============ TRADER SELECTION MODAL ============ */}
      {selectedTrader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-lg border-border bg-card p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div 
                  className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ backgroundColor: selectedTrader.riskLevel === "Low" ? "#22C55E" : selectedTrader.riskLevel === "Medium" ? "#EAB308" : "#EF4444" }}
                >
                  {selectedTrader.avatar}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedTrader.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedTrader.speciality}</p>
                </div>
              </div>
              <button onClick={() => setSelectedTrader(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">{selectedTrader.description}</p>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="text-lg font-bold text-success">{selectedTrader.winRate}%</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Monthly Return</p>
                <p className="text-lg font-bold text-primary">
                  +{activeTab === "fix" 
                    ? (selectedTrader.monthlyReturn * 1.2).toFixed(1) 
                    : selectedTrader.monthlyReturn}%
                </p>
              </div>
            </div>

            {/* Trade Settings */}
            <div className="space-y-4 border-t border-border pt-4">
              {activeTab === "copy" ? (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Allocation amount</label>
                    <input
                      type="number"
                      value={copyAmount}
                      onChange={(e) => setCopyAmount(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 font-mono"
                      min="100"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Minimum: {formatUserMoney(100)}</p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-3 text-sm">
                    <p className="font-medium text-destructive">Copy Trade Terms:</p>
                    <p className="text-muted-foreground mt-1">
                      24hr minimum lock. Cancel fee: 10% stake + 1.6% reverse ={" "}
                      {formatUserMoney((parseFloat(copyAmount) || 0) * 0.116)}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Stake amount</label>
                    <input
                      type="number"
                      value={fixAmount}
                      onChange={(e) => setFixAmount(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 font-mono"
                      min="500"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Minimum: {formatUserMoney(500)}</p>
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
                  {/* Live Preview Box */}
                  <div className={`rounded-lg border-2 p-4 ${livePreview.isPositive ? "border-success/50 bg-success/5" : "border-destructive/50 bg-destructive/5"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full animate-pulse ${livePreview.isPositive ? "bg-success" : "bg-destructive"}`} />
                        <span className="text-xs font-medium text-muted-foreground">LIVE PREVIEW</span>
                      </div>
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono font-bold">
                        {livePreview.coinSymbol}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Fixed price (USD spot)</p>
                        <p className="font-mono font-bold">${livePreview.basePrice.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Current (USD spot)</p>
                        <p className={`font-mono font-bold ${livePreview.isPositive ? "text-success" : "text-destructive"}`}>
                          ${livePreview.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-background p-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Real-time Earnings</p>
                        <p className={`text-2xl font-mono font-bold ${livePreview.isPositive ? "text-success" : "text-destructive"}`}>
                          {livePreview.isPositive ? "+" : ""}
                          {formatUserMoney(livePreview.earnings)}
                        </p>
                      </div>
                      <div className={`rounded-lg px-3 py-2 ${livePreview.isPositive ? "bg-success/20" : "bg-destructive/20"}`}>
                        <p className={`text-lg font-mono font-bold ${livePreview.isPositive ? "text-success" : "text-destructive"}`}>
                          {livePreview.isPositive ? "+" : ""}{livePreview.priceChange.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    
                    <p className="mt-2 text-xs text-center text-muted-foreground">
                      Live preview: how {livePreview.coinSymbol} might move while your trader manages the stake — your
                      real Container view tracks day‑by‑day earnings once you lock.
                    </p>
                  </div>

                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground space-y-2">
                    <p className="font-semibold text-foreground">How earnings show up</p>
                    <p>
                      After you lock, the trader you picked trades on your behalf. Earnings appear as natural,
                      day‑by‑day progress — some sessions quieter, some stronger — so you can feel momentum while the
                      coin stays supported during slower periods.
                    </p>
                    <p className="text-xs">
                      Withdrawal windows for earnings follow the milestones on this screen; your Container dashboard
                      stays the source of truth.
                    </p>
                  </div>

                  <div className="rounded-lg bg-warning/10 p-3 text-sm space-y-2">
                    <p className="font-medium text-warning">Fixed Trade Terms:</p>
                    <ul className="text-muted-foreground space-y-1">
                      <li>
                        - Stake <strong>FROZEN</strong> for {fixPeriod} month{fixPeriod > 1 ? "s" : ""}. Early pullout (funded
                        sessions): 10% agreement default + insurance from stake only;{" "}
                        <strong>full session earnings</strong> credited to Nexus Main with net principal.
                      </li>
                      <li>- Earnings Withdrawal: <strong className="text-success">
                        {fixPeriod === 1 ? "30%" : fixPeriod === 3 ? "50%" : "70%"}
                      </strong> every 5 days
                        {fixPeriod === 6 && <span className="text-primary"> (or 10% daily)</span>}
                      </li>
                    </ul>
                    <div className="pt-2 border-t border-warning/30 text-xs">
                      <p className="text-muted-foreground">
                        <strong>How it works:</strong> Your stake is fixed with the coin so the trader can defend
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

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedTrader(null)}>
                Cancel
              </Button>
              <Button 
                className={`flex-1 ${activeTab === "fix" ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}`}
                onClick={() => activeTab === "copy" ? handleActivateCopy(selectedTrader) : handleActivateFix(selectedTrader)}
                disabled={
                  isProcessing ||
                  (activeTab === "fix" &&
                    (!traderEligibleForFixedTrade(userLevel, selectedTrader.riskLevel) ||
                      fixLiquidityGate))
                }
              >
                {isProcessing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                ) : activeTab === "copy" ? (
                  <><Play className="h-4 w-4 mr-2" /> Start Copying</>
                ) : (
                  <><Lock className="h-4 w-4 mr-2" /> Lock & Fix</>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ============ CANCEL CONFIRMATION MODAL ============ */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md border-destructive/30 bg-card p-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold">Cancel Copy Trade?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Cancellation will incur a fee of <strong>10% of stake + 1.6% reverse fee</strong>
              </p>
              {(() => {
                const trade = activeCopyTrades.find(t => t.traderId === showCancelConfirm)
                if (!trade) return null
                const fee = trade.amount * 0.116
                const returnAmt = trade.amount + trade.earned - fee
                return (
                    <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
                    <div className="flex justify-between">
                      <span>Stake:</span>
                      <span>{formatUserMoney(trade.amount)}</span>
                    </div>
                    <div className="flex justify-between text-success">
                      <span>Earned:</span>
                      <span>+{formatUserMoney(trade.earned)}</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>Fee:</span>
                      <span>-{formatUserMoney(fee)}</span>
                    </div>
                    <div className="flex justify-between font-bold mt-2 pt-2 border-t border-border">
                      <span>You receive:</span>
                      <span>{formatUserMoney(returnAmt)}</span>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowCancelConfirm(null)}>
                Keep Trading
              </Button>
              <Button 
                variant="destructive" 
                className="flex-1"
                onClick={() => handleCancelCopyTrade(showCancelConfirm)}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Cancel"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
