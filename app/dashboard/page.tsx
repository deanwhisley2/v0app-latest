"use client"

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
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
import { coinsData } from "@/lib/coins-data"
import type { DashboardTradeView } from "@/lib/dashboard-trade-view"
import type { Coin } from "@/lib/coins-data"
import { TRADING_USER_LEVEL } from "@/lib/trading-user-level"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useDashboardTestimonialNotifs } from "@/hooks/use-dashboard-testimonial-notifs"
import { DashboardTestimonialStrip } from "@/components/dashboard/dashboard-testimonial-strip"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import {
  buildActivitySnapshot,
  clearDashboardActivity,
  readDashboardActivity,
  resolveCoinForSession,
  writeDashboardActivity,
} from "@/lib/dashboard-activity-session"

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

const initialMarketFeed: MarketFeedState = {
  status: "loading",
  gainers: [],
  volumeLeaders: [],
  catalog: [],
}

export default function DashboardPage() {
  const router = useRouter()
  const { registerAppNavigator } = useNexusNotifications()
  const { user, isLoading: authLoading, signOut, isGuestSession } = useAuth()
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
  const [showFundModal, setShowFundModal] = useState<"add" | "withdraw" | null>(null)
  const [fundAmount, setFundAmount] = useState("")
  const [fundMethod, setFundMethod] = useState<"mtn" | "airtel" | "bank" | "wallet">("mtn")
  const [fundPhone, setFundPhone] = useState("")
  const [isFundProcessing, setIsFundProcessing] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [marketFeed, setMarketFeed] = useState<MarketFeedState>(initialMarketFeed)

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

  const offlineGainers = useMemo(
    () => [...coinsData].sort((a, b) => b.change24h - a.change24h).slice(0, 28),
    []
  )
  const offlineVolume = useMemo(
    () => [...coinsData].sort((a, b) => b.volume - a.volume).slice(0, 28),
    []
  )

  const tradeCatalog = useMemo(() => {
    if (marketFeed.catalog.length > 0) return marketFeed.catalog
    return coinsData
  }, [marketFeed.catalog])

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
  
  // Load connected exchanges from localStorage + account metadata for cross-device continuity.
  useEffect(() => {
    if (typeof window === "undefined") return
    const fromRows = (rows: Array<{ id: string; name: string; balance?: number; isDefault?: boolean }>) => {
      setConnectedExchanges(
        rows.map((e) => ({
          id: e.id,
          name: e.name,
          balance: e.balance || 0,
          isDefault: e.isDefault,
        }))
      )
      const defaultExchange = rows.find((e) => e.isDefault)
      if (defaultExchange) setSelectedExchangeId(defaultExchange.id)
    }
    const stored = localStorage.getItem("nexus_exchanges")
    if (stored) {
      const exchanges = JSON.parse(stored)
      fromRows(exchanges)
    }
    const metadataExchanges = (user?.user_metadata as Record<string, unknown> | undefined)?.nexus_exchanges
    if (Array.isArray(metadataExchanges) && metadataExchanges.length > 0) {
      fromRows(metadataExchanges as Array<{ id: string; name: string; balance?: number; isDefault?: boolean }>)
    }
  }, [user])
  
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
    return { email, username, fullName, level: TRADING_USER_LEVEL }
  }, [user])

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
      }
      setMainBalance(Number(json.available_balance ?? 0))
      setTotalEarnings(Number(json.total_earnings ?? 0))
    })()
  }, [authLoading, user, isGuestSession])

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

  const handleFundSubmit = useCallback(() => {
    const amount = parseFloat(fundAmount)
    if (!amount || amount <= 0) return
    setIsFundProcessing(true)
    setTimeout(() => {
      if (showFundModal === "add") {
        setMainBalance(prev => prev + amount)
        showToast(`$${amount.toFixed(2)} added to your account`, "success")
      } else {
        if (amount > mainBalance) {
          showToast("Insufficient balance", "error")
          setIsFundProcessing(false)
          return
        }
        setMainBalance(prev => prev - amount)
        showToast(`$${amount.toFixed(2)} withdrawal initiated`, "success")
      }
      setIsFundProcessing(false)
      setShowFundModal(null)
      setFundAmount("")
      setFundPhone("")
    }, 1800)
  }, [fundAmount, showFundModal, mainBalance, showToast])

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
                onClick={() => router.push("/joelin")}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80"
              >
                Joelin
              </button>
              <button
                onClick={() => router.push(`/expert-mode?symbol=${encodeURIComponent(selectedCoinSymbol)}`)}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80"
              >
                Expert Mode
              </button>
              <button
                onClick={() => { setShowFundModal("add"); setFundAmount(""); setFundPhone(""); }}
                className="flex items-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-success/90"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Funds
              </button>
              <button
                onClick={() => { setShowFundModal("withdraw"); setFundAmount(""); setFundPhone(""); }}
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

            {/* Payment Methods */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              {[
                { id: "mtn" as const, name: "MTN Mobile Money", color: "#FFCC00", textColor: "#000" },
                { id: "airtel" as const, name: "Airtel Money", color: "#ED1C24", textColor: "#fff" },
                { id: "bank" as const, name: "Bank Transfer", color: "#1E40AF", textColor: "#fff" },
                { id: "wallet" as const, name: "Crypto Wallet", color: "#8B5CF6", textColor: "#fff" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setFundMethod(m.id)}
                  className={`rounded-xl border-2 px-3 py-3 text-left transition-all ${fundMethod === m.id ? "border-primary" : "border-border"}`}
                >
                  <div className="mb-1 h-1.5 w-6 rounded-full" style={{ backgroundColor: m.color }} />
                  <p className="text-xs font-semibold">{m.name}</p>
                </button>
              ))}
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Amount (USD)</label>
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
                    onClick={() => setFundAmount(amt.toString())}
                    className="flex-1 rounded-lg bg-muted py-2 text-xs font-medium hover:bg-muted/80"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Phone for mobile money */}
            {(fundMethod === "mtn" || fundMethod === "airtel") && (
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Phone Number</label>
                <input
                  type="tel"
                  value={fundPhone}
                  onChange={(e) => setFundPhone(e.target.value)}
                  placeholder="+256 7XX XXX XXX"
                  className="w-full rounded-lg border border-border bg-background py-3 px-4 text-sm outline-none transition-colors focus:border-primary"
                />
              </div>
            )}

            {/* Bank info for deposit */}
            {fundMethod === "bank" && showFundModal === "add" && (
              <div className="mb-4 rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-semibold text-foreground">Bank Transfer Details</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Bank:</span><span className="font-mono">Nexus Trading Bank</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Account:</span><span className="font-mono">1234567890</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">SWIFT:</span><span className="font-mono">NXTRUGKA</span></div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleFundSubmit}
              disabled={!fundAmount || isFundProcessing}
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
              ) : showFundModal === "add" ? (
                `Add $${fundAmount || "0"}`
              ) : (
                `Withdraw $${fundAmount || "0"}`
              )}
            </button>
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
                userLevel={TRADING_USER_LEVEL}
                isGuestSession={isGuestSession}
              />
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
                tradingUserLevel={TRADING_USER_LEVEL}
              />
            </main>
          </div>
        )}
      </div>

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
