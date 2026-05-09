"use client"

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { useOperationalBootstrap } from "@/contexts/OperationalBootstrapContext"
import { supabase } from "@/lib/supabaseClient"
import { Header } from "@/components/dashboard/header"
import { Ticker } from "@/components/dashboard/ticker"
import { Sidebar } from "@/components/dashboard/sidebar"
import { MarketTable } from "@/components/dashboard/market-table"
import { AIPanel } from "@/components/dashboard/ai-panel"
import { BottomNav } from "@/components/dashboard/bottom-nav"
import { ToastNotification, useToast } from "@/components/dashboard/toast-notification"
import { WalletScreen } from "@/components/dashboard/wallet-screen"
import { SettingsScreen, type SettingsView } from "@/components/dashboard/settings-screen"
import { LiveAnalysisOverlay } from "@/components/dashboard/live-analysis-overlay"
import { TradeCoinExplorer } from "@/components/dashboard/trade-coin-explorer"
import { PremiumTradeWorkspace } from "@/components/dashboard/premium/premium-trade-workspace"
import { LiveMarketFeedBar } from "@/components/dashboard/live-market-feed-bar"
import { OrderHistoryScreen } from "@/components/dashboard/order-history-screen"
import { CoinListScreen } from "@/components/dashboard/coin-list-screen"
import { TradingAnalyticsScreen } from "@/components/dashboard/trading-analytics-screen"
import { TradeSubnavChips } from "@/components/dashboard/trade-subnav-chips"
import { ContainerMode } from "@/components/dashboard/container-mode"
import { coinsData } from "@/lib/coins-data"
import type { DashboardTradeView } from "@/lib/dashboard-trade-view"
import type { Coin } from "@/lib/coins-data"
import type { FocusCoinInsight } from "@/lib/expert/phase2-types"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useDashboardTestimonialNotifs } from "@/hooks/use-dashboard-testimonial-notifs"
import { DashboardTestimonialStrip } from "@/components/dashboard/dashboard-testimonial-strip"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import {
  buildActivitySnapshot,
  clearDashboardActivity,
  hydrateWorkspaceFromRemote,
  readDashboardActivity,
  resolveCoinForSession,
  writeDashboardActivity,
} from "@/lib/dashboard-activity-session"
import { broadcastOperationalBump } from "@/lib/nexus-operational-sync-broadcast"
import { OperationalContinuityHud } from "@/components/dashboard/operational-continuity-hud"

interface CurrentUser {
  email: string
  username: string
  fullName: string
  level: number
}

type MarketFeedState = {
  status: "loading" | "live" | "error" | "disabled"
  gainers: Coin[]
  volumeLeaders: Coin[]
  catalog: Coin[]
  updatedAt?: number
  error?: string
}

type RetailerRow = {
  id: string
  user_id: string
  payment_numbers: Array<{ label?: string; value?: string }>
  credit_basin: number
  under_review: boolean
  under_review_reason?: string | null
  country_code?: string | null
  is_country_retailer?: boolean
  liquidity_status?: string | null
  whatsapp_number?: string | null
  contact_phone?: string | null
  registered_payee_names?: string | null
  estimated_response_minutes?: number | null
}

type QualifiedRetailer = RetailerRow & { spendable_liquidity?: number }

type RetailerFundingRequest = {
  id: string
  retailer_id: string
  amount: number
  tx_reference: string
  status: string
  note?: string | null
  appeal_note?: string | null
  fund_channel?: string | null
  mobile_network?: string | null
  escalated_to_admin?: boolean | null
  created_at: string
}

type IncomingFundReq = {
  id: string
  user_id: string
  amount: number
  tx_reference: string
  status: string
  mobile_network?: string | null
  created_at: string
}

type ContainerBalanceEvent = {
  id: string
  event_type: string
  category?: string
  gross_amount: number
  fee_amount: number
  net_amount: number
  transaction_ref?: string
  status?: string
  summary?: string
  created_at: string
}

const initialMarketFeed: MarketFeedState = {
  status: "loading",
  gainers: [],
  volumeLeaders: [],
  catalog: [],
}

function normalizeSymbol(value: string): string {
  const upper = value.toUpperCase().trim()
  return upper.endsWith("USDT") ? upper.slice(0, -4) : upper
}

export default function DashboardPage() {
  const router = useRouter()
  const { registerAppNavigator } = useNexusNotifications()
  const { user, isLoading: authLoading, signOut, isGuestSession } = useAuth()
  const op = useOperationalBootstrap()
  const activityUserId = user?.id ?? "guest"
  const { formatUserMoney } = useUserPreferences()
  const testimonialNotif = useDashboardTestimonialNotifs({
    enabled: Boolean(user) && !isGuestSession,
    userId: user?.id,
    formatUserMoney,
  })
  const [activeTab, setActiveTab] = useState("trade")
  const [tradeView, setTradeView] = useState<DashboardTradeView>("live-trading")
  const [settingsRequestedView, setSettingsRequestedView] = useState<SettingsView | null>(null)
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState("BTC")
  const [showBalance, setShowBalance] = useState(true)
  const [mainBalance, setMainBalance] = useState(0)
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [activeContainerEarnings, setActiveContainerEarnings] = useState(0)
  const [containerWithdrawableEarnings, setContainerWithdrawableEarnings] = useState(0)
  const [containerFeesPaid, setContainerFeesPaid] = useState(0)
  const [isContainerFlowBusy, setIsContainerFlowBusy] = useState(false)
  const [containerEvents, setContainerEvents] = useState<ContainerBalanceEvent[]>([])
  const [showFundModal, setShowFundModal] = useState<"add" | "withdraw" | null>(null)
  const [fundAmount, setFundAmount] = useState("")
  const [isFundProcessing, setIsFundProcessing] = useState(false)
  const [fundTxReference, setFundTxReference] = useState("")
  const [fundNote, setFundNote] = useState("")
  const [selectedRetailerId, setSelectedRetailerId] = useState("")
  const [retailerRows, setRetailerRows] = useState<RetailerRow[]>([])
  const [fundRequests, setFundRequests] = useState<RetailerFundingRequest[]>([])
  const [retailerPaymentNumbersInput, setRetailerPaymentNumbersInput] = useState("")
  const [l1FundSource, setL1FundSource] = useState<"pick" | "crypto" | "local">("pick")
  const [fundingCountryCodeInput, setFundingCountryCodeInput] = useState("")
  const [fundMobileNetwork, setFundMobileNetwork] = useState("")
  const [qualifiedRetailers, setQualifiedRetailers] = useState<QualifiedRetailer[]>([])
  const [loadingQualifiedRetailers, setLoadingQualifiedRetailers] = useState(false)
  const [cryptoFundingMeta, setCryptoFundingMeta] = useState<{
    companyCryptoWallet: string | null
    companyCryptoNetwork: string
  } | null>(null)
  const [retailerOpsBlocked, setRetailerOpsBlocked] = useState(false)
  const [retailerIncoming, setRetailerIncoming] = useState<IncomingFundReq[]>([])
  const [retailerTopupRequests, setRetailerTopupRequests] = useState<
    Array<{ id: string; amount_requested: number; crypto_tx_reference: string; status: string }>
  >([])
  const [adminTopupQueue, setAdminTopupQueue] = useState<
    Array<{
      id: string
      retailer_user_id: string
      amount_requested: number
      crypto_tx_reference: string
      status: string
    }>
  >([])
  const [adminFundingQueue, setAdminFundingQueue] = useState<RetailerFundingRequest[]>([])
  const [topupCryptoRef, setTopupCryptoRef] = useState("")
  const [topupNote, setTopupNote] = useState("")
  const [deskCountryCode, setDeskCountryCode] = useState("")
  const [deskIsCountryRetailer, setDeskIsCountryRetailer] = useState(false)
  const [deskLiquidityStatus, setDeskLiquidityStatus] = useState<"active" | "busy" | "offline" | "low_liquidity">(
    "offline"
  )
  const [deskWhatsapp, setDeskWhatsapp] = useState("")
  const [deskContactPhone, setDeskContactPhone] = useState("")
  const [deskPayeeNames, setDeskPayeeNames] = useState("")
  const { toast, showToast, hideToast } = useToast()

  const [marketFeed, setMarketFeed] = useState<MarketFeedState>(initialMarketFeed)
  const [analyzedProfitableCoins, setAnalyzedProfitableCoins] = useState<FocusCoinInsight[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/binance/live-market", { cache: "no-store" })
        const data = (await res.json()) as {
          ok?: boolean
          source?: string
          updatedAt?: number
          gainers?: Coin[]
          volumeLeaders?: Coin[]
          catalog?: Coin[]
          error?: string
        }
        if (cancelled) return
        if (res.status === 503) {
          setMarketFeed((prev) => ({
            status: "disabled",
            error: data.error,
            gainers: prev.gainers,
            volumeLeaders: prev.volumeLeaders,
            catalog: prev.catalog,
          }))
          return
        }
        if (!res.ok || !data.ok || !data.catalog?.length) {
          setMarketFeed((prev) => ({
            status: "error",
            error: data.error || `HTTP ${res.status}`,
            gainers: prev.gainers,
            volumeLeaders: prev.volumeLeaders,
            catalog: prev.catalog,
            updatedAt: prev.updatedAt,
          }))
          return
        }
        setMarketFeed({
          status: "live",
          gainers: data.gainers ?? [],
          volumeLeaders: data.volumeLeaders ?? [],
          catalog: data.catalog,
          updatedAt: data.updatedAt,
        })
      } catch (e) {
        if (!cancelled) {
          setMarketFeed((prev) => ({
            status: "error",
            error: e instanceof Error ? e.message : "Network error",
            gainers: prev.gainers,
            volumeLeaders: prev.volumeLeaders,
            catalog: prev.catalog,
          }))
        }
      }
    }
    void load()
    const id = window.setInterval(load, 45_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadJoelinInsights = async () => {
      try {
        const res = await fetch("/api/joelin/oscillator", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { analyzedProfitableCoins?: FocusCoinInsight[] }
        if (!cancelled) {
          setAnalyzedProfitableCoins(data.analyzedProfitableCoins ?? [])
        }
      } catch {
        // keep last good insights
      }
    }
    void loadJoelinInsights()
    const id = window.setInterval(loadJoelinInsights, 300_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const offlineGainers = useMemo(
    () => [...coinsData].sort((a, b) => b.change24h - a.change24h).slice(0, 28),
    []
  )
  const offlineVolume = useMemo(
    () => [...coinsData].sort((a, b) => b.volume - a.volume).slice(0, 28),
    []
  )

  const tradeCatalog = useMemo(() => {
    const base = marketFeed.catalog.length > 0 ? marketFeed.catalog : coinsData
    if (analyzedProfitableCoins.length === 0) return base
    const profitable = new Set(analyzedProfitableCoins.map((c) => normalizeSymbol(c.symbol)))
    return [...base].sort((a, b) => {
      const aBoost = profitable.has(normalizeSymbol(a.symbol)) ? 1 : 0
      const bBoost = profitable.has(normalizeSymbol(b.symbol)) ? 1 : 0
      if (aBoost !== bBoost) return bBoost - aBoost
      return b.change24h - a.change24h
    })
  }, [marketFeed.catalog, analyzedProfitableCoins])

  const exploreGainers = marketFeed.gainers.length > 0 ? marketFeed.gainers : offlineGainers
  const exploreVolume = marketFeed.volumeLeaders.length > 0 ? marketFeed.volumeLeaders : offlineVolume
  const isBinanceCatalogLive = marketFeed.status === "live" && marketFeed.catalog.length > 0

  const tickerCoins = useMemo(() => {
    const src = tradeCatalog.length >= 8 ? tradeCatalog : coinsData
    return src.slice(0, 28)
  }, [tradeCatalog])

  const headerSearchCoins = useMemo(() => tradeCatalog.slice(0, 40), [tradeCatalog])
  
  // Security and Exchange State
  const [securityLevel, setSecurityLevel] = useState<1 | 2 | 3>(1)
  const [connectedExchanges, setConnectedExchanges] = useState<Array<{ id: string; name: string; balance: number; isDefault?: boolean }>>([])
  const [selectedExchangeId, setSelectedExchangeId] = useState<string | undefined>()
  
  // Connected exchanges: DB bootstrap (profiles) → JWT metadata → localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return
    const fromRows = (rows: Array<{ id: string; name: string; balance?: number; isDefault?: boolean }>) => {
      setConnectedExchanges(
        rows.map((e) => ({
          id: e.id,
          name: e.name,
          balance: typeof e.balance === "number" ? e.balance : 0,
          isDefault: e.isDefault,
        }))
      )
      const defaultExchange = rows.find((e) => e.isDefault)
      if (defaultExchange) setSelectedExchangeId(defaultExchange.id)
    }

    if (!user || isGuestSession) {
      const stored = localStorage.getItem("nexus_exchanges")
      if (stored) {
        try {
          fromRows(JSON.parse(stored))
        } catch {
          /* ignore */
        }
      }
      return
    }

    const dbRows = op.snapshot?.exchangeConnections
    if (Array.isArray(dbRows) && dbRows.length > 0) {
      fromRows(dbRows as Array<{ id: string; name: string; balance?: number; isDefault?: boolean }>)
      return
    }

    if (op.isLoading) return

    const metadataExchanges = (user.user_metadata as Record<string, unknown> | undefined)?.nexus_exchanges
    if (Array.isArray(metadataExchanges) && metadataExchanges.length > 0) {
      fromRows(metadataExchanges as Array<{ id: string; name: string; balance?: number; isDefault?: boolean }>)
      return
    }

    const stored = localStorage.getItem("nexus_exchanges")
    if (stored) {
      try {
        fromRows(JSON.parse(stored))
      } catch {
        /* ignore */
      }
    }
  }, [user, isGuestSession, op.snapshot, op.isLoading])
  
  // Live Analysis State
  const [liveAnalysis, setLiveAnalysis] = useState<{
    active: boolean
    coin: Coin | null
    strategies: string[]
    expertMode: boolean
    autoTrade: boolean
    tradeAmount: number
  }>({
    active: false,
    coin: null,
    strategies: [],
    expertMode: false,
    autoTrade: false,
    tradeAmount: 100,
  })

  const activityHydratedRef = useRef(false)
  const activityLastSerializedRef = useRef<string>("")
  const persistWorkspaceTimerRef = useRef<number | null>(null)
  const lastServerWorkspaceAppliedRef = useRef<string>("")
  const lastWorkspacePostedRef = useRef<string>("")

  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    const snap = readDashboardActivity(activityUserId)
    if (snap) {
      setActiveTab(snap.activeTab)
      setTradeView(snap.tradeView)
      setSelectedCoinSymbol(snap.selectedCoinSymbol)
      setShowBalance(snap.showBalance)
      const catalog = marketFeed.catalog.length > 0 ? marketFeed.catalog : coinsData
      let liveActive = snap.live.active
      const coin = liveActive ? resolveCoinForSession(snap.live.coinSymbol, catalog) : null
      if (liveActive && !coin) liveActive = false
      setLiveAnalysis({
        active: liveActive,
        coin: liveActive ? coin : null,
        strategies: snap.live.strategies,
        expertMode: snap.live.expertMode,
        autoTrade: snap.live.autoTrade,
        tradeAmount: snap.live.tradeAmount,
      })
    }
    activityHydratedRef.current = true
    activityLastSerializedRef.current = JSON.stringify(
      buildActivitySnapshot(activityUserId, {
        activeTab: snap?.activeTab ?? "trade",
        tradeView: snap?.tradeView ?? "live-trading",
        selectedCoinSymbol: snap?.selectedCoinSymbol ?? "BTC",
        showBalance: snap?.showBalance ?? true,
        liveAnalysis: snap
          ? (() => {
              const cat = marketFeed.catalog.length > 0 ? marketFeed.catalog : coinsData
              let a = snap.live.active
              const c = a ? resolveCoinForSession(snap.live.coinSymbol, cat) : null
              if (a && !c) a = false
              return {
                active: a,
                coin: a ? c : null,
                strategies: snap.live.strategies,
                expertMode: snap.live.expertMode,
                autoTrade: snap.live.autoTrade,
                tradeAmount: snap.live.tradeAmount,
              }
            })()
          : {
              active: false,
              coin: null,
              strategies: [],
              expertMode: false,
              autoTrade: false,
              tradeAmount: 100,
            },
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per session user; catalog resolved inside
  }, [activityUserId])

  useEffect(() => {
    if (!activityHydratedRef.current) return
    const snap = buildActivitySnapshot(activityUserId, {
      activeTab,
      tradeView,
      selectedCoinSymbol,
      showBalance,
      liveAnalysis,
    })
    const serialized = JSON.stringify(snap)
    if (serialized === activityLastSerializedRef.current) return
    activityLastSerializedRef.current = serialized
    writeDashboardActivity(snap)
  }, [activityUserId, activeTab, tradeView, selectedCoinSymbol, showBalance, liveAnalysis])

  // Authoritative Postgres workspace replaces tab-local snapshot when bootstrap delivers it.
  useEffect(() => {
    if (!user?.id || isGuestSession || op.isLoading || !activityHydratedRef.current) return
    const raw = op.snapshot?.workspaceSnapshot
    if (!raw || typeof raw !== "object") return
    const ser = JSON.stringify(raw)
    if (ser === lastServerWorkspaceAppliedRef.current) return
    const parsed = hydrateWorkspaceFromRemote(raw, user.id)
    if (!parsed) return
    lastServerWorkspaceAppliedRef.current = ser
    lastWorkspacePostedRef.current = ser

    setActiveTab(parsed.activeTab)
    setTradeView(parsed.tradeView)
    setSelectedCoinSymbol(parsed.selectedCoinSymbol)
    setShowBalance(parsed.showBalance)
    const catalog = marketFeed.catalog.length > 0 ? marketFeed.catalog : coinsData
    let liveActive = parsed.live.active
    const coin = liveActive ? resolveCoinForSession(parsed.live.coinSymbol, catalog) : null
    if (liveActive && !coin) liveActive = false
    const resolvedLive = {
      active: liveActive,
      coin: liveActive ? coin : null,
      strategies: parsed.live.strategies,
      expertMode: parsed.live.expertMode,
      autoTrade: parsed.live.autoTrade,
      tradeAmount: parsed.live.tradeAmount,
    }
    setLiveAnalysis(resolvedLive)
    writeDashboardActivity(parsed)
    activityLastSerializedRef.current = JSON.stringify(
      buildActivitySnapshot(activityUserId, {
        activeTab: parsed.activeTab,
        tradeView: parsed.tradeView,
        selectedCoinSymbol: parsed.selectedCoinSymbol,
        showBalance: parsed.showBalance,
        liveAnalysis: resolvedLive,
      })
    )
  }, [
    user?.id,
    isGuestSession,
    op.snapshot?.workspaceSnapshot,
    op.isLoading,
    activityUserId,
    marketFeed.catalog,
  ])

  // Debounced server persistence for USER_WORKSPACE_STATE (see lib/operational-state-scope.ts).
  useEffect(() => {
    if (!activityHydratedRef.current || !user?.id || isGuestSession) return
    const snap = buildActivitySnapshot(activityUserId, {
      activeTab,
      tradeView,
      selectedCoinSymbol,
      showBalance,
      liveAnalysis,
    })
    const ser = JSON.stringify(snap)
    if (ser === lastWorkspacePostedRef.current) return

    if (persistWorkspaceTimerRef.current) window.clearTimeout(persistWorkspaceTimerRef.current)
    persistWorkspaceTimerRef.current = window.setTimeout(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch("/api/user/operational-workspace", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ workspace: snap }),
        })
        if (!res.ok) return
        lastWorkspacePostedRef.current = ser
        broadcastOperationalBump("workspace")
      } catch {
        /* offline / transient */
      }
    }, 950)

    return () => {
      if (persistWorkspaceTimerRef.current) window.clearTimeout(persistWorkspaceTimerRef.current)
    }
  }, [
    activityUserId,
    activeTab,
    tradeView,
    selectedCoinSymbol,
    showBalance,
    liveAnalysis,
    user?.id,
    isGuestSession,
  ])

  useEffect(() => {
    if (!liveAnalysis.active || !liveAnalysis.coin?.symbol) return
    const next = resolveCoinForSession(liveAnalysis.coin.symbol, tradeCatalog)
    if (!next) return
    if (
      next.price === liveAnalysis.coin.price &&
      next.change24h === liveAnalysis.coin.change24h &&
      next.volume === liveAnalysis.coin.volume
    ) {
      return
    }
    setLiveAnalysis((prev) =>
      prev.active && prev.coin?.symbol === next.symbol ? { ...prev, coin: next } : prev
    )
  }, [tradeCatalog, liveAnalysis.active, liveAnalysis.coin])

  const currentUser = useMemo((): CurrentUser | null => {
    if (!user) return null
    const meta = user.user_metadata as Record<string, unknown> | undefined
    const email = user.email ?? ""
    const fullName =
      (typeof meta?.full_name === "string" && meta.full_name) ||
      (typeof meta?.fullName === "string" && meta.fullName) ||
      (email ? email.split("@")[0] : "User")
    const username =
      typeof meta?.username === "string" && meta.username
        ? meta.username
        : email.split("@")[0] || "user"
    const level = op.snapshot?.profile?.tradingUserLevel ?? 1
    return { email, username, fullName, level }
  }, [user, op.snapshot?.profile?.tradingUserLevel])

  const isDeanAdmin = useMemo(() => {
    const email = (currentUser?.email ?? "").toLowerCase().trim()
    const username = (currentUser?.username ?? "").toLowerCase().trim()
    return email === "deanwhisley2@gmail.com" || username === "deanwhisley2"
  }, [currentUser?.email, currentUser?.username])

  useEffect(() => {
    if (isGuestSession) return
    if (!authLoading && !user) {
      router.replace("/auth/login")
    }
  }, [authLoading, user, isGuestSession, router])

  useEffect(() => {
    if (authLoading || !user || isGuestSession) return
    ;(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_verified")
        .eq("id", user.id)
        .maybeSingle()
      if (data?.is_verified === false) {
        router.replace(`/auth/verify?email=${encodeURIComponent(user.email ?? "")}`)
        await signOut()
      }
    })()
  }, [authLoading, user, isGuestSession, router, signOut])

  useEffect(() => {
    if (authLoading || !user || isGuestSession) return
    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const res = await fetch("/api/user/balance", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return

      const json = (await res.json()) as {
        available_balance?: number
        total_earnings?: number
        active_container_earnings?: number
        container_withdrawable_earnings?: number
        lifetime_container_fees?: number
      }
      setMainBalance(Number(json.available_balance ?? 0))
      setTotalEarnings(Number(json.total_earnings ?? 0))
      setActiveContainerEarnings(Number(json.active_container_earnings ?? 0))
      setContainerWithdrawableEarnings(Number(json.container_withdrawable_earnings ?? 0))
      setContainerFeesPaid(Number(json.lifetime_container_fees ?? 0))
    })()
  }, [authLoading, user, isGuestSession])

  useEffect(() => {
    if (isGuestSession || !user) return
    const b = op.snapshot?.userBalance
    if (!b) return
    setMainBalance(Number(b.available_balance ?? 0))
    setTotalEarnings(Number(b.total_earnings ?? 0))
    setActiveContainerEarnings(Number(b.active_container_earnings ?? 0))
    setContainerWithdrawableEarnings(Number(b.container_withdrawable_earnings ?? 0))
    setContainerFeesPaid(Number(b.lifetime_container_fees ?? 0))
  }, [isGuestSession, user?.id, op.snapshot?.userBalance])

  useEffect(() => {
    if (authLoading || !user || isGuestSession) return
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch("/api/user/financial-events", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const out = (await res.json().catch(() => ({}))) as { events?: ContainerBalanceEvent[] }
        setContainerEvents(out.events ?? [])
      } catch {
        /* ignore */
      }
    })()
  }, [authLoading, user, isGuestSession])

  const runContainerFlowAction = useCallback(
    async (action: "extract" | "transfer_to_main") => {
      if (isContainerFlowBusy) return
      try {
        setIsContainerFlowBusy(true)
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error("Session expired.")

        const requestBody =
          action === "extract"
            ? {
                action,
                // System-enforced fixed extraction slice; users cannot enter arbitrary amount.
                grossAmount: Math.max(0, Math.round(activeContainerEarnings * 0.25 * 100) / 100),
              }
            : { action }

        const res = await fetch("/api/user/container-earnings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(requestBody),
        })
        const out = (await res.json().catch(() => ({}))) as {
          error?: string
          feeAmount?: number
          creditedAmount?: number
          transferAmount?: number
          balances?: {
            available_balance?: number
            active_container_earnings?: number
            container_withdrawable_earnings?: number
          }
        }
        if (!res.ok) throw new Error(out.error || "Container balance action failed")
        setMainBalance(Number(out.balances?.available_balance ?? mainBalance))
        setActiveContainerEarnings(
          Number(out.balances?.active_container_earnings ?? activeContainerEarnings)
        )
        setContainerWithdrawableEarnings(
          Number(
            out.balances?.container_withdrawable_earnings ?? containerWithdrawableEarnings
          )
        )
        setContainerEvents((prev) => [
          {
            id: crypto.randomUUID(),
            event_type: action,
            gross_amount:
              Number(
                action === "extract"
                  ? requestBody.grossAmount
                  : out.transferAmount ?? out.creditedAmount ?? 0
              ) || 0,
            fee_amount: Number(out.feeAmount ?? 0),
            net_amount: Number(out.creditedAmount ?? out.transferAmount ?? 0),
            created_at: new Date().toISOString(),
          },
          ...prev,
        ])
        if (action === "extract") {
          setContainerFeesPaid((prev) => prev + Number(out.feeAmount ?? 0))
          showToast(
            `Earnings extracted: ${formatUserMoney(Number(out.creditedAmount ?? 0))} credited (1% fee applied).`,
            "success"
          )
        } else {
          showToast(
            `Transferred ${formatUserMoney(Number(out.transferAmount ?? 0))} to main balance.`,
            "success"
          )
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Container balance action failed", "error")
      } finally {
        setIsContainerFlowBusy(false)
      }
    },
    [
      activeContainerEarnings,
      containerWithdrawableEarnings,
      formatUserMoney,
      isContainerFlowBusy,
      mainBalance,
      showToast,
    ]
  )

  useEffect(() => {
    if (authLoading || !user || isGuestSession) return
    const cc = op.snapshot?.profile?.fundingCountryCode
    if (typeof cc === "string" && cc.length >= 2) {
      setFundingCountryCodeInput((prev) => prev || cc.toUpperCase().slice(0, 2))
    }
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch("/api/user/retailer-funding", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        if (!res.ok) return
        const json = (await res.json()) as {
          userLevel?: number
          retailers?: RetailerRow[]
          requests?: RetailerFundingRequest[]
        }
        if ((json.userLevel ?? 1) !== 1) {
          setRetailerRows(json.retailers ?? [])
        }
        setFundRequests(json.requests ?? [])
      } catch {
        /* ignore */
      }
    })()
  }, [authLoading, user, isGuestSession, op.snapshot?.profile?.fundingCountryCode])

  useEffect(() => {
    if (authLoading || !user || isGuestSession) return
    if ((op.snapshot?.profile?.tradingUserLevel ?? 1) !== 2) return
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const ps = await fetch("/api/user/retailer-pending-summary", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        if (!ps.ok) return
        const sj = (await ps.json()) as { opsBlocked?: boolean }
        setRetailerOpsBlocked(Boolean(sj.opsBlocked))
      } catch {
        /* ignore */
      }
    })()
  }, [authLoading, user, isGuestSession, op.snapshot?.profile?.tradingUserLevel])

  useEffect(() => {
    if (!showFundModal || showFundModal !== "add" || authLoading || !user || isGuestSession) return
    let cancelled = false
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const rf = await fetch("/api/user/retailer-funding", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        if (cancelled || !rf.ok) return
        const j = (await rf.json()) as {
          requests?: RetailerFundingRequest[]
          retailers?: RetailerRow[]
          userLevel?: number
        }
        setFundRequests(j.requests ?? [])
        const lvl = j.userLevel ?? (currentUser?.level ?? 1)
        if (lvl === 2) {
          const [pq, pr, ps] = await Promise.all([
            fetch("/api/user/retailer-incoming-queue", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            }),
            fetch("/api/user/retailer-admin-topup", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            }),
            fetch("/api/user/retailer-pending-summary", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            }),
          ])
          if (pq.ok) {
            const pj = (await pq.json()) as { requests?: IncomingFundReq[] }
            setRetailerIncoming(pj.requests ?? [])
          }
          if (pr.ok) {
            const tj = (await pr.json()) as {
              requests?: Array<{ id: string; amount_requested: number; crypto_tx_reference: string; status: string }>
            }
            setRetailerTopupRequests(tj.requests ?? [])
          }
          if (ps.ok) {
            const sj = (await ps.json()) as { opsBlocked?: boolean }
            setRetailerOpsBlocked(Boolean(sj.opsBlocked))
          }
          const profRes = await fetch("/api/user/retailer-profile", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          })
          if (profRes.ok) {
            const profJson = (await profRes.json()) as { profile?: RetailerRow | null }
            const p = profJson.profile
            if (p) {
              const nums = p.payment_numbers ?? []
              setRetailerPaymentNumbersInput(nums.map((n) => n.value).join(", "))
              setDeskCountryCode((p.country_code ?? "").slice(0, 2))
              setDeskIsCountryRetailer(Boolean(p.is_country_retailer))
              if (p.liquidity_status === "active" || p.liquidity_status === "busy" || p.liquidity_status === "offline" || p.liquidity_status === "low_liquidity") {
                setDeskLiquidityStatus(p.liquidity_status)
              }
              setDeskWhatsapp(p.whatsapp_number ?? "")
              setDeskContactPhone(p.contact_phone ?? "")
              setDeskPayeeNames(p.registered_payee_names ?? "")
            }
          }
        }
        if (lvl === 5 && isDeanAdmin) {
          const [aq, rf] = await Promise.all([
            fetch("/api/admin/retailer-liquidity-topup", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            }),
            fetch("/api/admin/retailer-funding", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            }),
          ])
          if (aq.ok) {
            const aj = (await aq.json()) as {
              requests?: Array<{
                id: string
                retailer_user_id: string
                amount_requested: number
                crypto_tx_reference: string
                status: string
              }>
            }
            setAdminTopupQueue(aj.requests ?? [])
          }
          if (rf.ok) {
            const fj = (await rf.json()) as {
              requests?: RetailerFundingRequest[]
            }
            setAdminFundingQueue(fj.requests ?? [])
          }
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    authLoading,
    user,
    isGuestSession,
    showFundModal,
    currentUser?.level,
    isDeanAdmin,
  ])

  const handleLogout = useCallback(async () => {
    const uid = user?.id ?? ""
    const { error } = await signOut()
    if (error) console.error(error)
    try {
      localStorage.removeItem("nexus_session")
      sessionStorage.removeItem(`nexus_login_testimonial_strip_v1:${uid}`)
      sessionStorage.removeItem(`nexus_dash_visible_ms_v1:${uid}`)
      clearDashboardActivity()
    } catch {
      /* ignore */
    }
    router.replace("/")
    router.refresh()
  }, [signOut, router, user?.id])

  const selectedCoin = useMemo(
    () => tradeCatalog.find((c) => c.symbol === selectedCoinSymbol) || coinsData[0],
    [tradeCatalog, selectedCoinSymbol]
  )

  const handleCoinSelect = useCallback((symbol: string) => {
    setSelectedCoinSymbol(symbol)
  }, [])

  const handleTradeViewChange = useCallback((view: DashboardTradeView) => {
    setTradeView(view)
    setActiveTab("trade")
  }, [])

  const handleHeaderTabChange = useCallback((tab: string) => {
    setActiveTab(tab)
    setSettingsRequestedView(null)
  }, [])

  const handleSettingsRequestConsumed = useCallback(() => {
    setSettingsRequestedView(null)
  }, [])

  const handleNotificationNav = useCallback(
    (nav: NexusNotificationNav) => {
      switch (nav.kind) {
        case "trade":
          setSelectedCoinSymbol(nav.symbol ?? "BTC")
          setTradeView("live-trading")
          setActiveTab("trade")
          break
        case "wallet":
          setActiveTab("wallet")
          break
        case "settings":
          setSettingsRequestedView(nav.view as SettingsView)
          setActiveTab("settings")
          break
        case "orders":
          setTradeView("order-history")
          setActiveTab("trade")
          break
        case "expert-analysis":
          router.push(`/expert-mode/analysis/${encodeURIComponent(nav.analysisId)}`)
          break
        default:
          break
      }
    },
    [router]
  )

  useEffect(() => {
    registerAppNavigator(handleNotificationNav)
    try {
      const pending = sessionStorage.getItem("nexus_pending_nav")
      if (pending) {
        sessionStorage.removeItem("nexus_pending_nav")
        handleNotificationNav(JSON.parse(pending) as NexusNotificationNav)
      }
    } catch {
      /* ignore */
    }
    return () => registerAppNavigator(null)
  }, [registerAppNavigator, handleNotificationNav])

  const handleOrder = useCallback(
    (type: "buy" | "sell", amount: number, leverage: number) => {
      showToast(
        `${type.toUpperCase()} Order Filled - ${selectedCoin.symbol} @ Market (${leverage}x)`,
        "success"
      )
    },
    [selectedCoin.symbol, showToast]
  )

  // Navigate from Wallstreet to Trade with analysis
  const handleNavigateToTrade = useCallback(
    (
      coin: Coin,
      strategies: string[],
      expertMode: boolean,
      settings: { autoTrade: boolean; tradeAmount: number; executionMode?: "nex_auto" | "manual" }
    ) => {
      const mode = settings.executionMode ?? (settings.autoTrade ? "nex_auto" : "manual")
      const autoTrade = mode === "nex_auto"
      setSelectedCoinSymbol(coin.symbol)
      setLiveAnalysis({
        active: true,
        coin,
        strategies,
        expertMode,
        autoTrade,
        tradeAmount: settings.tradeAmount,
      })
      setTradeView("live-trading")
      setActiveTab("trade")
      showToast(
        `${mode === "nex_auto" ? "Nex Auto-Trade" : "Manual trade"} desk opened for ${coin.symbol} (${strategies.length} strategies)`,
        "success"
      )
    },
    [showToast]
  )

  const handleLiveAnalysisTrade = useCallback((type: "buy" | "sell", amount: number) => {
    if (liveAnalysis.coin) {
      showToast(
        `${type.toUpperCase()} Order - ${liveAnalysis.coin.symbol} - $${amount}`,
        type === "buy" ? "success" : "success"
      )
    }
  }, [liveAnalysis.coin, showToast])

  const handleRetailerIncomingAction = useCallback(
    async (requestId: string, action: "approve" | "reject") => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error("Session expired.")
        const res = await fetch("/api/user/retailer-incoming-queue", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ requestId, action }),
        })
        const out = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(out.error || "Action failed.")
        showToast(action === "approve" ? "Customer credited from your Nexus balance." : "Request rejected.", "success")
        setRetailerIncoming((prev) => prev.filter((x) => x.id !== requestId))
        const ps = await fetch("/api/user/retailer-pending-summary", { headers: { Authorization: `Bearer ${token}` } })
        if (ps.ok) {
          const sj = (await ps.json()) as { opsBlocked?: boolean }
          setRetailerOpsBlocked(Boolean(sj.opsBlocked))
        }
        const rf = await fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } })
        if (rf.ok) {
          const j = await rf.json()
          setMainBalance(Number(j.available_balance ?? 0))
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Action failed.", "error")
      }
    },
    [showToast]
  )

  const handleSaveRetailerDesk = useCallback(async () => {
    const paymentNumbers = retailerPaymentNumbersInput
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((value) => ({ label: "primary", value }))
    if (paymentNumbers.length === 0) {
      showToast("Enter at least one payment number.", "error")
      return
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired.")
      const res = await fetch("/api/user/retailer-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          paymentNumbers,
          countryCode: deskCountryCode.trim().slice(0, 2),
          isCountryRetailer: deskIsCountryRetailer,
          liquidityStatus: deskLiquidityStatus,
          whatsappNumber: deskWhatsapp,
          contactPhone: deskContactPhone,
          registeredPayeeNames: deskPayeeNames,
        }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string; profile?: RetailerRow }
      if (!res.ok) throw new Error(out.error || "Could not save retailer profile.")
      setRetailerRows((prev) => {
        const filtered = prev.filter((r) => r.id !== out.profile?.id)
        return out.profile ? [out.profile, ...filtered] : prev
      })
      showToast("Retailer desk saved.", "success")
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed.", "error")
    }
  }, [
    retailerPaymentNumbersInput,
    deskCountryCode,
    deskIsCountryRetailer,
    deskLiquidityStatus,
    deskWhatsapp,
    deskContactPhone,
    deskPayeeNames,
    showToast,
  ])

  const handleRetailerCryptoTopupSubmit = useCallback(async () => {
    const amt = parseFloat(fundAmount)
    if (!(amt > 0) || Number.isNaN(amt)) {
      showToast("Enter requested top-up amount.", "error")
      return
    }
    const refTx = topupCryptoRef.trim()
    if (!refTx) {
      showToast("Enter blockchain / payment reference.", "error")
      return
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired.")
      const res = await fetch("/api/user/retailer-admin-topup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amountRequested: amt,
          cryptoTxReference: refTx,
          note: topupNote || null,
        }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(out.error || "Submit failed.")
      showToast(
        "Top-up request queued. Wire crypto to the company wallet shown in Funding → crypto. Admin will approve (+5%).",
        "success",
      )
      setTopupCryptoRef("")
      setTopupNote("")
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Submit failed.", "error")
    }
  }, [fundAmount, topupCryptoRef, topupNote, showToast])

  const handleAdminLiquidityTopup = useCallback(
    async (requestId: string, action: "approve" | "reject") => {
      if (!isDeanAdmin || (currentUser?.level ?? 1) < 5) {
        showToast("Admin workflow requires the owner Level-5 desk.", "error")
        return
      }
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error("Session expired.")
        const res = await fetch("/api/admin/retailer-liquidity-topup", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ requestId, action }),
        })
        const out = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(out.error || "Admin update failed.")
        setAdminTopupQueue((prev) => prev.filter((x) => x.id !== requestId))
        showToast(action === "approve" ? "Retailer credited base + commission." : "Top-up rejected.", "success")
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Admin failed.", "error")
      }
    },
    [showToast, isDeanAdmin, currentUser?.level]
  )

  const handleLoadQualifiedRetailers = useCallback(async () => {
    const amt = parseFloat(fundAmount)
    if (!(amt > 0) || Number.isNaN(amt)) {
      showToast("Enter the amount you will send first.", "error")
      return
    }
    const cc = fundingCountryCodeInput.trim().toUpperCase().slice(0, 2)
    if (cc.length !== 2) {
      showToast("Enter your 2-letter country code (e.g. UG, KE).", "error")
      return
    }
    setLoadingQualifiedRetailers(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired.")
      await fetch("/api/user/funding-country", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: cc }),
      })
      const res = await fetch(
        `/api/user/qualified-retailers?amount=${encodeURIComponent(String(amt))}&country=${encodeURIComponent(cc)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      )
      const out = (await res.json().catch(() => ({}))) as { error?: string; retailers?: QualifiedRetailer[] }
      if (!res.ok) throw new Error(out.error || "Could not load retailers.")
      setQualifiedRetailers(out.retailers ?? [])
      setSelectedRetailerId("")
      if ((out.retailers ?? []).length === 0) {
        showToast("No desks can cover this amount in that country yet. Try Crypto funding or retry later.")
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load failed.", "error")
    } finally {
      setLoadingQualifiedRetailers(false)
    }
  }, [fundAmount, fundingCountryCodeInput, showToast])

  useEffect(() => {
    if (showFundModal !== "add" || l1FundSource !== "crypto") return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/user/funding-meta", { cache: "no-store" })
        const j = (await res.json().catch(() => ({}))) as {
          companyCryptoWallet?: string | null
          companyCryptoNetwork?: string
        }
        if (!cancelled) {
          setCryptoFundingMeta({
            companyCryptoWallet: j.companyCryptoWallet ?? null,
            companyCryptoNetwork: j.companyCryptoNetwork ?? "USDT TRC20",
          })
        }
      } catch {
        if (!cancelled) setCryptoFundingMeta(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showFundModal, l1FundSource])

  const handleFundSubmit = useCallback(() => {
    const amount = parseFloat(fundAmount)
    const level = currentUser?.level ?? 1
    if (!(amount > 0) && !(showFundModal === "withdraw")) {
      if (showFundModal === "add" && level === 1 && l1FundSource === "crypto") return
      if (showFundModal === "add" && level === 1 && l1FundSource === "pick") return
      if (showFundModal === "add" && level === 2) return
      if (showFundModal === "add" && level === 5) return
      return
    }

    setIsFundProcessing(true)
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error("Session expired.")

        if (showFundModal === "withdraw") {
          if (!(amount > 0)) throw new Error("Enter an amount.")
          if (amount > mainBalance) throw new Error("Insufficient balance")
          if (level === 2 && retailerOpsBlocked) {
            throw new Error(
              "You have pending local funding approvals. Clear or approve those requests before withdrawing Nexus balance.",
            )
          }
          const res = await fetch("/api/user/main-balance/adjust", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: "debit",
              amount,
              reason: "Withdrawal request initiated from dashboard.",
            }),
          })
          const out = (await res.json().catch(() => ({}))) as { error?: string; available_balance?: number }
          if (!res.ok) throw new Error(out.error || "Withdrawal failed")
          setMainBalance(Number(out.available_balance ?? mainBalance))
          showToast(`$${amount.toFixed(2)} withdrawal initiated`, "success")
          setShowFundModal(null)
          setFundAmount("")
          setFundTxReference("")
          setFundNote("")
          return
        }

        if (showFundModal === "add") {
          if (level !== 1) {
            throw new Error(
              level === 2
                ? "Use “Save retailer desk”, incoming queue actions, or “Submit crypto top-up” in this dialog."
                : "Use admin queue buttons for approvals — direct balance credit here is disabled.",
            )
          }
          if (l1FundSource !== "local") {
            throw new Error("Open “Local mobile money”, complete payment off-app, then use Confirm.")
          }
          if (!(amount > 0)) throw new Error("Enter the amount you funded.")
          if (!selectedRetailerId || !fundTxReference.trim()) {
            throw new Error("Pick a qualified retailer and enter your mobile-money reference.")
          }
          const ccSave = fundingCountryCodeInput.trim().toUpperCase().slice(0, 2)
          if (ccSave.length === 2) {
            await fetch("/api/user/funding-country", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ code: ccSave }),
            })
          }
          const res = await fetch("/api/user/retailer-funding", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              retailerId: selectedRetailerId,
              amount,
              txReference: fundTxReference,
              note: fundNote,
              mobileNetwork: fundMobileNetwork || null,
              fundChannel: "local_mobile",
              fundingCountryCode: ccSave.length === 2 ? ccSave : undefined,
            }),
          })
          const out = (await res.json().catch(() => ({}))) as { error?: string; request?: RetailerFundingRequest }
          if (!res.ok) throw new Error(out.error || "Could not create pending funding.")
          setFundRequests((prev) => [out.request as RetailerFundingRequest, ...prev])
          showToast("Pending funding created — retailer will verify your mobile-money payment.", "success")
          setQualifiedRetailers([])
          setSelectedRetailerId("")
          setFundTxReference("")
          setL1FundSource("pick")
          setShowFundModal(null)
          setFundAmount("")
          setFundNote("")
          return
        }

        throw new Error("Unsupported fund action.")
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Fund action failed", "error")
      } finally {
        setIsFundProcessing(false)
      }
    })()
  }, [
    fundAmount,
    showFundModal,
    mainBalance,
    showToast,
    currentUser?.level,
    selectedRetailerId,
    fundTxReference,
    fundNote,
    l1FundSource,
    fundMobileNetwork,
    fundingCountryCodeInput,
    retailerOpsBlocked,
  ])

  const handleAdminFundingAction = useCallback(async (requestId: string, action: "approve" | "reject" | "resolve") => {
    if (!isDeanAdmin || (currentUser?.level ?? 1) < 5) {
      showToast("Admin rights restricted to the owner account.", "error")
      return
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Session expired.")
      const res = await fetch("/api/admin/retailer-funding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId, action }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(out.error || "Admin action failed")
      const next =
        action === "approve" ? "approved" : action === "reject" ? "rejected" : "resolved"
      setAdminFundingQueue((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: next } : r)),
      )
      showToast(`Request ${action}d.`, "success")
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Admin action failed", "error")
    }
  }, [showToast, isDeanAdmin, currentUser?.level])

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const sidebarPanel = (
    <Sidebar
      coins={tradeCatalog.slice(0, 16)}
      portfolioTotal={mainBalance}
      portfolioChange={12.4}
      activeTradeView={tradeView}
      onTradeViewChange={handleTradeViewChange}
    />
  )

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <Header
        activeTab={activeTab}
        onTabChange={handleHeaderTabChange}
        coins={headerSearchCoins}
        currentUser={currentUser ?? undefined}
        onLogout={handleLogout}
      />

      <LiveMarketFeedBar
        status={marketFeed.status}
        updatedAt={marketFeed.updatedAt}
        errorMessage={marketFeed.error}
      />

      {/* Ticker — live catalog when market feed is active */}
      <Ticker coins={tickerCoins} />

      {/* Main Balance Card */}
      <div className="mx-auto max-w-[1600px] px-4 pt-4">
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Balance Info */}
            <div className="flex flex-1 items-center gap-4 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">Available balance</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Bot earnings (total):{" "}
                    {showBalance ? formatUserMoney(totalEarnings) : "••••"}
                  </span>
                  <button
                    onClick={() => setShowBalance(!showBalance)}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    title={showBalance ? "Hide balance" : "Show balance"}
                  >
                    {showBalance ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {showBalance ? formatUserMoney(mainBalance) : "••••••••"}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => (currentUser?.level ?? 1) <= 2 ? showToast("Joelin is locked for Level 1/2 accounts.", "error") : router.push("/joelin")}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={(currentUser?.level ?? 1) <= 2}
              >
                Joelin {(currentUser?.level ?? 1) <= 2 ? "🔒" : ""}
              </button>
              <button
                onClick={() =>
                  (currentUser?.level ?? 1) <= 2
                    ? showToast("Expert Mode is locked for Level 1/2 accounts.", "error")
                    : router.push(`/expert-mode?symbol=${encodeURIComponent(selectedCoinSymbol)}`)
                }
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={(currentUser?.level ?? 1) <= 2}
              >
                Expert Mode {(currentUser?.level ?? 1) <= 2 ? "🔒" : ""}
              </button>
              <button
                onClick={() => {
                  setShowFundModal("add")
                  setFundAmount("")
          setL1FundSource("pick")
                  setQualifiedRetailers([])
                  setSelectedRetailerId("")
                  setFundTxReference("")
                  setFundNote("")
                  setFundMobileNetwork("")
                  setCryptoFundingMeta(null)
                }}
                className="flex items-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-success/90"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Funds
              </button>
              <button
                onClick={() => {
                  setShowFundModal("withdraw")
                  setFundAmount("")
                }}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4l-8 8 8 8" />
                </svg>
                Withdraw
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Nexus Main Balance</p>
            <p className="mt-1 font-mono text-lg font-bold">
              {showBalance ? formatUserMoney(mainBalance) : "••••"}
            </p>
            <p className="text-[11px] text-muted-foreground">Cashout and new container funding source.</p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Active Container Earnings</p>
            <p className="mt-1 font-mono text-lg font-bold">
              {showBalance ? formatUserMoney(activeContainerEarnings) : "••••"}
            </p>
            <button
              type="button"
              onClick={() => void runContainerFlowAction("extract")}
              disabled={isContainerFlowBusy || activeContainerEarnings <= 0}
              className="mt-2 w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {isContainerFlowBusy ? "Processing..." : "Extract Earnings (auto 25%)"}
            </button>
          </div>
          <div className="rounded-xl border border-success/30 bg-success/10 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Container Withdrawable Earnings</p>
            <p className="mt-1 font-mono text-lg font-bold">
              {showBalance ? formatUserMoney(containerWithdrawableEarnings) : "••••"}
            </p>
            <button
              type="button"
              onClick={() => void runContainerFlowAction("transfer_to_main")}
              disabled={isContainerFlowBusy || containerWithdrawableEarnings <= 0}
              className="mt-2 w-full rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {isContainerFlowBusy ? "Processing..." : "Transfer To Main Account"}
            </button>
            <div className="mt-2 max-h-16 space-y-1 overflow-y-auto rounded bg-background/50 p-1.5">
              {(containerEvents.length ? containerEvents : []).slice(0, 2).map((event) => (
                <p key={event.id} className="text-[10px] text-muted-foreground">
                  {event.summary || event.event_type} • {formatUserMoney(Number(event.net_amount ?? 0))}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Exchange Balances</p>
            <p className="mt-1 font-mono text-lg font-bold">
              {showBalance
                ? formatUserMoney(
                    connectedExchanges.reduce((sum, ex) => sum + Number(ex.balance ?? 0), 0)
                  )
                : "••••"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Separate from Nexus wallet. Fees paid: {showBalance ? formatUserMoney(containerFeesPaid) : "••••"}
            </p>
          </div>
        </div>
      </div>

      {/* Add Fund / Withdraw Modal */}
      {showFundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {showFundModal === "add" ? "Add Funds" : "Withdraw Funds"}
              </h2>
              <button
                onClick={() => setShowFundModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {showFundModal === "withdraw" ? null : (currentUser?.level ?? 1) === 2 && retailerOpsBlocked ? (
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-muted-foreground">
                You have pending local funding requests from Level 1 members. Withdrawals from Nexus main balance are
                blocked until pending requests are cleared. You can still update your desk, approve queue items, or
                request liquidity from Admin.
              </div>
            ) : null}

            {showFundModal === "withdraw" ? null : (currentUser?.level ?? 1) === 1 && showFundModal === "add" ? (
              <div className="mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setL1FundSource("crypto")}
                    className={`rounded-xl border-2 px-3 py-3 text-left text-xs font-semibold transition-all ${
                      l1FundSource === "crypto" ? "border-primary" : "border-border"
                    }`}
                  >
                    A — Crypto (Intl)
                  </button>
                  <button
                    type="button"
                    onClick={() => setL1FundSource("local")}
                    className={`rounded-xl border-2 px-3 py-3 text-left text-xs font-semibold transition-all ${
                      l1FundSource === "local" ? "border-primary" : "border-border"
                    }`}
                  >
                    B — Local mobile money
                  </button>
                </div>

                {l1FundSource === "pick" && (
                  <p className="text-[11px] text-muted-foreground">
                    Choose Option A (international crypto to the company wallet) or Option B (local mobile money through a
                    verified in-country desk).
                  </p>
                )}

                {l1FundSource === "crypto" && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                    <p className="font-semibold text-foreground">Company receive wallet</p>
                    <p className="text-muted-foreground">
                      Send only on the advertised network ({cryptoFundingMeta?.companyCryptoNetwork ?? "configure NEXUS_COMPANY_CRYPTO_* in env"})
                      .
                    </p>
                    <p className="break-all rounded bg-background p-2 font-mono text-[11px]">
                      {cryptoFundingMeta?.companyCryptoWallet ?? "Ask support for today’s treasury address."}
                    </p>
                  </div>
                )}

                {l1FundSource === "local" && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground">Country + amount + network name</p>
                    <input
                      type="text"
                      maxLength={2}
                      value={fundingCountryCodeInput}
                      onChange={(e) => setFundingCountryCodeInput(e.target.value.toUpperCase())}
                      placeholder="Country ISO (UG, KE, …)"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm uppercase"
                    />
                    <select
                      value={fundMobileNetwork}
                      onChange={(e) => setFundMobileNetwork(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Mobile network…</option>
                      <option value="MTN">MTN Mobile Money</option>
                      <option value="Airtel">Airtel Money</option>
                      <option value="MPesa">M-Pesa</option>
                      <option value="Orange">Orange Money</option>
                      <option value="Other">Other (note in memo)</option>
                    </select>
                    <button
                      type="button"
                      disabled={loadingQualifiedRetailers}
                      onClick={() => void handleLoadQualifiedRetailers()}
                      className="w-full rounded-lg bg-muted py-2 text-xs font-semibold hover:bg-muted/80 disabled:opacity-50"
                    >
                      {loadingQualifiedRetailers ? "Searching…" : "Find desks with liquidity"}
                    </button>
                    <select
                      value={selectedRetailerId}
                      onChange={(e) => setSelectedRetailerId(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select qualified retailer…</option>
                      {qualifiedRetailers.map((r) => (
                        <option key={r.id} value={r.id}>
                          Desk {String(r.country_code ?? "")} • {r.liquidity_status ?? "—"} • spendable{" "}
                          {typeof r.spendable_liquidity === "number" ? r.spendable_liquidity.toFixed(0) : "—"}
                        </option>
                      ))}
                    </select>
                    {qualifiedRetailers.find((r) => r.id === selectedRetailerId) ? (
                      <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] space-y-1">
                        <p className="font-semibold text-warning">Payment details — verify before paying</p>
                        <p>Numbers: {(qualifiedRetailers.find((x) => x.id === selectedRetailerId)?.payment_numbers ?? [])
                          .map((p) => `${p.label || ""}:${p.value}`.trim())
                          .join(" · ") || "(none)"}
                        </p>
                        <p>
                          WhatsApp/call: {qualifiedRetailers.find((x) => x.id === selectedRetailerId)?.whatsapp_number || "—"}{" "}
                          / {qualifiedRetailers.find((x) => x.id === selectedRetailerId)?.contact_phone || "—"}
                        </p>
                        <p>Payee name(s): {qualifiedRetailers.find((x) => x.id === selectedRetailerId)?.registered_payee_names || "See numbers above"}</p>
                        <p>
                          Desk status: {qualifiedRetailers.find((x) => x.id === selectedRetailerId)?.liquidity_status} · ETA ~{" "}
                          {qualifiedRetailers.find((x) => x.id === selectedRetailerId)?.estimated_response_minutes ?? "—"} min
                        </p>
                        <p className="text-destructive">
                          Confirm only after you sent mobile money matching these exact identities. Wrong numbers void the
                          request.
                        </p>
                      </div>
                    ) : null}
                    <input
                      type="text"
                      value={fundTxReference}
                      onChange={(e) => setFundTxReference(e.target.value)}
                      placeholder="Mobile money transaction reference…"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={fundNote}
                      onChange={(e) => setFundNote(e.target.value)}
                      placeholder="Optional memo"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div className="max-h-32 space-y-1 overflow-y-auto rounded bg-muted/40 p-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Your funding timeline</p>
                  {fundRequests.slice(0, 6).map((r) => (
                    <div key={r.id} className="text-[11px]">
                      {r.tx_reference.slice(0, 18)} • {Number(r.amount).toFixed(2)} • {r.status}
                      {(r.status === "rejected" || r.status === "under_review" || r.status === "pending") && (
                        <button
                          type="button"
                          className="ml-2 text-primary underline"
                          onClick={async () => {
                            const appealNote = window.prompt("Briefly explain the issue (never share PINs/passwords)")
                            if (!appealNote?.trim()) return
                            const { data: s } = await supabase.auth.getSession()
                            const token = s.session?.access_token
                            if (!token) return
                            const res = await fetch("/api/user/retailer-funding", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ requestId: r.id, appealNote: appealNote.trim() }),
                            })
                            if (!res.ok) return
                            setFundRequests((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, status: "appealed", appeal_note: appealNote } : x
                              )
                            )
                          }}
                        >
                          Appeal
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {showFundModal === "withdraw" ? null : (currentUser?.level ?? 1) === 2 && showFundModal === "add" ? (
              <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-semibold text-muted-foreground">Level 2 — retailer desk & liquidity</p>
                <label className="flex items-center gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={deskIsCountryRetailer}
                    onChange={(e) => setDeskIsCountryRetailer(e.target.checked)}
                  />
                  Offer in-country liquidity (mobile money desks)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    maxLength={2}
                    value={deskCountryCode}
                    onChange={(e) => setDeskCountryCode(e.target.value.toUpperCase())}
                    placeholder="Country"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs uppercase"
                  />
                  <select
                    value={deskLiquidityStatus}
                    onChange={(e) =>
                      setDeskLiquidityStatus(e.target.value as "active" | "busy" | "offline" | "low_liquidity")
                    }
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="offline">offline</option>
                    <option value="active">active</option>
                    <option value="busy">busy</option>
                    <option value="low_liquidity">low_liquidity</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={retailerPaymentNumbersInput}
                  onChange={(e) => setRetailerPaymentNumbersInput(e.target.value)}
                  placeholder="Wallet / MM numbers comma-separated"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={deskPayeeNames}
                  onChange={(e) => setDeskPayeeNames(e.target.value)}
                  placeholder="Registered pay-to names shown to users"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={deskWhatsapp}
                    onChange={(e) => setDeskWhatsapp(e.target.value)}
                    placeholder="WhatsApp"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  />
                  <input
                    type="text"
                    value={deskContactPhone}
                    onChange={(e) => setDeskContactPhone(e.target.value)}
                    placeholder="Voice line"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveRetailerDesk()}
                  className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground"
                >
                  Save retailer desk
                </button>
                <div className="max-h-36 space-y-2 overflow-y-auto rounded border border-border bg-background p-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Incoming local funds</p>
                  {retailerIncoming.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No pending approvals.</p>
                  ) : (
                    retailerIncoming.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                        <span>
                          {Number(r.amount).toFixed(2)} · {r.tx_reference.slice(0, 16)} · {r.mobile_network ?? "MM"}
                        </span>
                        <span className="flex gap-1">
                          <button
                            type="button"
                            className="rounded bg-emerald-600 px-2 py-0.5 text-white"
                            onClick={() => void handleRetailerIncomingAction(r.id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="rounded bg-rose-700 px-2 py-0.5 text-white"
                            onClick={() => void handleRetailerIncomingAction(r.id, "reject")}
                          >
                            Reject
                          </button>
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="rounded border border-primary/40 bg-background p-2 text-[11px] space-y-2">
                  <p className="font-semibold">Request Nexus liquidity back from Admin (+5% on approval)</p>
                  <p className="text-muted-foreground">
                    Send crypto using the treasury address shown in Option A instructions, then paste the explorer ref
                    here.
                  </p>
                  <input
                    type="text"
                    value={topupCryptoRef}
                    onChange={(e) => setTopupCryptoRef(e.target.value)}
                    placeholder="Crypto txn id / explorer ref…"
                    className="w-full rounded border border-border bg-background px-2 py-1"
                  />
                  <textarea
                    value={topupNote}
                    onChange={(e) => setTopupNote(e.target.value)}
                    placeholder="Admin note…"
                    className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={() => void handleRetailerCryptoTopupSubmit()}
                    className="w-full rounded bg-success py-2 text-xs font-semibold text-white"
                  >
                    Submit top-up request ({fundAmount.trim() ? `amount below: ${fundAmount}` : "set amount ↓"})
                  </button>
                  <div className="max-h-24 overflow-y-auto text-[10px] text-muted-foreground">
                    {retailerTopupRequests.map((t) => (
                      <div key={t.id}>
                        {Number(t.amount_requested).toFixed(2)} • {t.status} • {t.crypto_tx_reference.slice(0, 12)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {(currentUser?.level ?? 1) === 5 && showFundModal === "add" && isDeanAdmin && (
              <>
                <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">User funding appeals / legacy queue</p>
                  <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                    {adminFundingQueue.slice(0, 12).map((r) => (
                      <div key={r.id} className="rounded-md bg-background px-2 py-1 text-[11px]">
                        <p>
                          Ref: {r.tx_reference} | {Number(r.amount).toFixed(2)} | {r.status}{" "}
                          {r.escalated_to_admin ? "· escalated" : ""}{" "}
                          {r.fund_channel ?? ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white"
                            onClick={() => void handleAdminFundingAction(r.id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="rounded bg-rose-600 px-2 py-0.5 text-[10px] text-white"
                            onClick={() => void handleAdminFundingAction(r.id, "reject")}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="rounded bg-slate-600 px-2 py-0.5 text-[10px] text-white"
                            onClick={() => void handleAdminFundingAction(r.id, "resolve")}
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Retailer crypto top-ups (+5% platform commission)
                  </p>
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                    {adminTopupQueue.map((req) =>
                      req.status === "pending" ? (
                        <div key={req.id} className="rounded-md bg-background px-2 py-1 text-[11px]">
                          <p>
                            Ret {req.retailer_user_id.slice(0, 8)}… — {Number(req.amount_requested).toFixed(2)} —{" "}
                            {req.crypto_tx_reference}
                          </p>
                          <div className="mt-1 flex gap-1">
                            <button
                              type="button"
                              className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white"
                              onClick={() => void handleAdminLiquidityTopup(req.id, "approve")}
                            >
                              Credit +5%
                            </button>
                            <button
                              type="button"
                              className="rounded bg-rose-600 px-2 py-0.5 text-[10px] text-white"
                              onClick={() => void handleAdminLiquidityTopup(req.id, "reject")}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              </>
            )}

            {(currentUser?.level ?? 1) === 5 && showFundModal === "add" && !isDeanAdmin && (
              <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="text-xs font-semibold text-warning">Level 5 account detected</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Admin workflow rights are reserved for the owner account only.
                </p>
              </div>
            )}

            {(showFundModal === "withdraw" ||
              ((currentUser?.level ?? 1) === 1 && l1FundSource === "local") ||
              (currentUser?.level ?? 1) === 2) && (
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  {showFundModal === "withdraw"
                    ? "Withdraw amount (Nexus units)"
                    : (currentUser?.level ?? 1) === 2
                      ? "Requested admin top-up amount (Nexus units)"
                      : "Funding amount (match what you send)"}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-border bg-background py-3 pl-8 pr-4 font-mono text-lg outline-none transition-colors focus:border-primary"
                  />
                </div>
                {showFundModal === "withdraw" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Available: ${showBalance ? mainBalance.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "••••"}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  {[50, 100, 250, 500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFundAmount(amt.toString())}
                      className="flex-1 rounded-lg bg-muted py-2 text-xs font-medium hover:bg-muted/80"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleFundSubmit}
                disabled={
                  isFundProcessing ||
                  (showFundModal === "withdraw" && (!fundAmount || parseFloat(fundAmount) <= 0)) ||
                  (showFundModal === "add" && (currentUser?.level ?? 1) === 1 && l1FundSource !== "local") ||
                  (showFundModal === "add" && (currentUser?.level ?? 1) === 2) ||
                  (showFundModal === "add" && (currentUser?.level ?? 1) === 5)
                }
                className={`flex w-full items-center justify-center gap-2 rounded-lg py-3 font-semibold text-white transition-colors disabled:opacity-50 ${
                  showFundModal === "add" ? "bg-success hover:bg-success/90" : "bg-primary hover:bg-primary/90"
                }`}
              >
                {isFundProcessing ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing...
                  </>
                ) : showFundModal === "withdraw" ? (
                  `Withdraw $${fundAmount || "0"}`
                ) : (currentUser?.level ?? 1) === 1 && l1FundSource === "local" ? (
                  "Confirm payment sent"
                ) : (currentUser?.level ?? 1) === 1 ? (
                  "Choose Local path to confirm"
                ) : (
                  "Add Funds"
                )}
              </button>
              {showFundModal === "add" && (currentUser?.level ?? 1) === 1 && l1FundSource === "crypto" ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-border py-2 text-sm font-medium"
                  onClick={() => setShowFundModal(null)}
                >
                  Close
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="mx-auto max-w-[1600px] px-4 pb-24 md:pb-4">
        {activeTab === "trade" && (
          <div className="flex flex-col gap-4 rounded-2xl bg-[#020308]/80 p-2 ring-1 ring-white/[0.04] lg:flex-row lg:p-3">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebarPanel}</div>

            <main className="flex min-w-0 flex-1 flex-col gap-4">
              <TradeSubnavChips active={tradeView} onChange={handleTradeViewChange} className="lg:hidden" />

              {tradeView === "live-trading" && (
                <>
                  <TradeCoinExplorer
                    newCoins={exploreGainers}
                    trendingCoins={exploreVolume}
                    leftColumnTitle={isBinanceCatalogLive ? "24h gainers" : "Sample 24h gainers"}
                    rightColumnTitle={isBinanceCatalogLive ? "24h volume leaders" : "Sample volume"}
                    selectedSymbol={selectedCoinSymbol}
                    onSelectSymbol={handleCoinSelect}
                  />

                  <PremiumTradeWorkspace
                    selectedCoin={selectedCoin}
                    tradeCatalog={tradeCatalog}
                    onCoinSelect={handleCoinSelect}
                    onOrder={handleOrder}
                    connectedExchanges={connectedExchanges}
                    onNexExecute={(params) => {
                      showToast(
                        `NEX ${params.mode === "auto" ? "Joelin " : ""}trade executed — ${params.strategy} on ${params.coin} ($${params.amount})`,
                        "success"
                      )
                    }}
                    advancedTradingLocked={(currentUser?.level ?? 1) <= 2}
                    executionLocked={(currentUser?.level ?? 1) <= 2}
                    chartOverlay={
                      liveAnalysis.active && liveAnalysis.coin ? (
                        <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center p-2 sm:p-4">
                          <LiveAnalysisOverlay
                            coin={liveAnalysis.coin}
                            strategies={liveAnalysis.strategies}
                            expertMode={liveAnalysis.expertMode}
                            autoTrade={liveAnalysis.autoTrade}
                            tradeAmount={liveAnalysis.tradeAmount}
                            onClose={() => setLiveAnalysis((prev) => ({ ...prev, active: false }))}
                            onTrade={handleLiveAnalysisTrade}
                            onToggleAutoTrade={() => setLiveAnalysis((prev) => ({ ...prev, autoTrade: !prev.autoTrade }))}
                          />
                        </div>
                      ) : null
                    }
                  />
                </>
              )}

              {tradeView === "order-history" && (
                <div className="rounded-2xl border border-white/[0.06] bg-card/95 p-4 text-card-foreground shadow-inner">
                  <OrderHistoryScreen />
                </div>
              )}

              {tradeView === "watchlist" && (
                <div className="rounded-2xl border border-white/[0.06] bg-card/95 p-4 text-card-foreground shadow-inner">
                  <CoinListScreen
                    mode="watchlist"
                    catalog={tradeCatalog}
                    onSelectSymbol={handleCoinSelect}
                    onOpenLiveTrading={() => handleTradeViewChange("live-trading")}
                  />
                </div>
              )}

              {tradeView === "favorites" && (
                <div className="rounded-2xl border border-white/[0.06] bg-card/95 p-4 text-card-foreground shadow-inner">
                  <CoinListScreen
                    mode="favorites"
                    catalog={tradeCatalog}
                    onSelectSymbol={handleCoinSelect}
                    onOpenLiveTrading={() => handleTradeViewChange("live-trading")}
                  />
                </div>
              )}

              {tradeView === "analytics" && (
                <div className="rounded-2xl border border-white/[0.06] bg-card/95 p-4 text-card-foreground shadow-inner">
                  <TradingAnalyticsScreen availableBalance={mainBalance} />
                </div>
              )}
            </main>
          </div>
        )}

        {activeTab === "markets" && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebarPanel}</div>
            <main className="min-w-0 flex-1">
              <MarketTable
                coins={tradeCatalog}
                onCoinSelect={handleCoinSelect}
                selectedCoin={selectedCoin}
              />
            </main>
          </div>
        )}

        {activeTab === "wallstreet" && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebarPanel}</div>
            <main className="min-w-0 flex-1">
              {(currentUser?.level ?? 1) <= 2 ? (
                <ContainerMode
                  userLevel={(currentUser?.level ?? 1) as 1 | 2}
                  retailerCreditSeller={Boolean(op.snapshot?.profile?.retailerCreditSeller)}
                  retailerLiquidityOpsBlocked={retailerOpsBlocked}
                />
              ) : (
                <AIPanel
                  coins={tradeCatalog}
                  selectedCoin={selectedCoin}
                  onNavigateToTrade={handleNavigateToTrade}
                  onStrategyCoinChange={(c) => setSelectedCoinSymbol(c.symbol)}
                  hasExchangeConnection={
                    process.env.NEXT_PUBLIC_ALLOW_SERVER_SIDE_EXECUTION_UI === "1" ||
                    connectedExchanges.length > 0
                  }
                  defaultExchangeId={
                    selectedExchangeId ??
                    connectedExchanges.find((e) => e.isDefault)?.id ??
                    connectedExchanges[0]?.id
                  }
                  realTradeEligible={
                    process.env.NEXT_PUBLIC_ALLOW_SERVER_SIDE_EXECUTION_UI === "1" ||
                    (connectedExchanges.length > 0 &&
                      connectedExchanges.some((e) => (e.balance ?? 0) > 0))
                  }
                  exchangePermissionsOk={
                    process.env.NEXT_PUBLIC_ALLOW_SERVER_SIDE_EXECUTION_UI === "1" ||
                    connectedExchanges.length > 0
                  }
                  userLevel={(currentUser?.level ?? 1) as 1 | 2 | 3 | 4 | 5}
                  isGuestSession={isGuestSession}
                />
              )}
            </main>
          </div>
        )}

        {activeTab === "wallet" && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebarPanel}</div>
            <main className="min-w-0 flex-1">
              <WalletScreen coins={tradeCatalog.slice(0, 24)} />
            </main>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebarPanel}</div>
            <main className="min-w-0 flex-1">
              <SettingsScreen
                onLogout={handleLogout}
                requestedView={settingsRequestedView}
                onRequestViewConsumed={handleSettingsRequestConsumed}
                isGuestSession={isGuestSession}
                tradingUserLevel={currentUser?.level ?? 1}
              />
            </main>
          </div>
        )}
      </div>

      {!isGuestSession && (
        <div className="mx-auto max-w-[1600px] px-4 pb-1">
          <OperationalContinuityHud />
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <BottomNav activeTab={activeTab} onTabChange={handleHeaderTabChange} isGuestSession={isGuestSession} />

      {/* Toast */}
      <ToastNotification
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <DashboardTestimonialStrip
        visible={testimonialNotif.visible}
        text={testimonialNotif.text}
        onDismiss={testimonialNotif.dismiss}
      />
    </div>
  )
}
