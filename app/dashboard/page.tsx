"use client"

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { useOperationalBootstrap } from "@/contexts/OperationalBootstrapContext"
import { supabase } from "@/lib/supabaseClient"
import { Header } from "@/components/dashboard/header"
import { Ticker } from "@/components/dashboard/ticker"
import { Sidebar } from "@/components/dashboard/sidebar"
import { AIPanel } from "@/components/dashboard/ai-panel"
import { BottomNav } from "@/components/dashboard/bottom-nav"
import { ToastNotification, useToast } from "@/components/dashboard/toast-notification"
import { WalletScreen } from "@/components/dashboard/wallet-screen"
import { SettingsScreen, type SettingsView } from "@/components/dashboard/settings-screen"
import { LiveMarketFeedBar } from "@/components/dashboard/live-market-feed-bar"
import { LiveAnalysisOverlay } from "@/components/dashboard/live-analysis-overlay"
import { ContainerMode } from "@/components/dashboard/container-mode"
import { coinsData } from "@/lib/coins-data"
import type { DashboardTradeView } from "@/lib/dashboard-trade-view"
import type { Coin } from "@/lib/coins-data"
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
import { PROCESSING_COPY } from "@/lib/nexus-financial-policy"
import {
  convertFromUsd,
  corridorFiatForCountryIso2,
  formatLocalFiatAmount,
  localFiatUnitsToUsd,
} from "@/lib/currency-display"

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
  payment_numbers_updated_at?: string | null
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
  /** Set by API from public.profiles.email for desk directory views. */
  profile_email?: string | null
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
  const { formatUserMoney, currency, locale } = useUserPreferences()
  const testimonialNotif = useDashboardTestimonialNotifs({
    enabled: Boolean(user) && !isGuestSession,
    userId: user?.id,
    formatUserMoney,
  })
  const [activeTab, setActiveTab] = useState("container")
  const tradeView: DashboardTradeView = "overview"
  const [settingsRequestedView, setSettingsRequestedView] = useState<SettingsView | null>(null)
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState("BTC")
  const [showBalance, setShowBalance] = useState(true)
  const [mainBalance, setMainBalance] = useState(0)
  const [withdrawalPendingBalance, setWithdrawalPendingBalance] = useState(0)
  const [referralInfo, setReferralInfo] = useState<{
    referralCode: string
    referralLink: string
    refereeCount: number
  } | null>(null)
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
  const [fundPayerName, setFundPayerName] = useState("")
  const [fundPayerPhone, setFundPayerPhone] = useState("")
  const [selectedRetailerId, setSelectedRetailerId] = useState("")
  const [retailerRows, setRetailerRows] = useState<RetailerRow[]>([])
  const [fundRequests, setFundRequests] = useState<RetailerFundingRequest[]>([])
  const [retailerPaymentNumbersInput, setRetailerPaymentNumbersInput] = useState("")
  const [l1FundSource, setL1FundSource] = useState<"pick" | "crypto" | "local">("pick")
  const [fundingCountryCodeInput, setFundingCountryCodeInput] = useState("")
  const [fundMobileNetwork, setFundMobileNetwork] = useState("")
  const [qualifiedRetailers, setQualifiedRetailers] = useState<QualifiedRetailer[]>([])
  const [loadingQualifiedRetailers, setLoadingQualifiedRetailers] = useState(false)
  /** True after user ran “See eligible retailers” at least once (enables empty-state message). */
  const [localMmRetailersSearched, setLocalMmRetailersSearched] = useState(false)
  /** Two-stage Local MM wizard: 1 = qualification only, 2 = desks + payment confirmation. */
  const [localMmWizardStep, setLocalMmWizardStep] = useState<1 | 2>(1)
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
  const [adminRetailerRows, setAdminRetailerRows] = useState<RetailerRow[]>([])
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
  /** Retailer desk: loaded on dashboard mount so refresh does not flash an empty registration form. */
  const [retailerDeskLoading, setRetailerDeskLoading] = useState(false)
  const [deskRegistrationComplete, setDeskRegistrationComplete] = useState(false)
  const [deskEditPaymentLines, setDeskEditPaymentLines] = useState(false)
  const [paymentNumbersCooldown, setPaymentNumbersCooldown] = useState<{
    canEditPaymentNumbers: boolean
    nextEligibleAt: string | null
  } | null>(null)
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
    return marketFeed.catalog.length > 0 ? marketFeed.catalog : coinsData
  }, [marketFeed.catalog])

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
        activeTab: snap?.activeTab ?? "container",
        tradeView: snap?.tradeView ?? "overview",
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

  /** Designated retailer credit desk (incoming queue, basin, admin top-up). */
  const retailerCreditDesk = useMemo(() => {
    const level = op.snapshot?.profile?.tradingUserLevel ?? 1
    return level === 2 && Boolean(op.snapshot?.profile?.retailerCreditSeller)
  }, [op.snapshot?.profile?.tradingUserLevel, op.snapshot?.profile?.retailerCreditSeller])

  // Enforce hard UI isolation: Level-2 retailer desks must use retailer workspace only.
  useEffect(() => {
    if (authLoading || !user || isGuestSession) return
    if (retailerCreditDesk) {
      router.replace("/retailer/dashboard")
    }
  }, [authLoading, user, isGuestSession, retailerCreditDesk, router])

  const applyRetailerProfileFromApi = useCallback(
    (payload: {
      profile?: RetailerRow | null
      deskRegistrationComplete?: boolean
      paymentNumbersCooldown?: { canEditPaymentNumbers: boolean; nextEligibleAt: string | null }
    }) => {
      if (typeof payload.deskRegistrationComplete === "boolean") {
        setDeskRegistrationComplete(payload.deskRegistrationComplete)
      }
      if (payload.paymentNumbersCooldown) {
        setPaymentNumbersCooldown(payload.paymentNumbersCooldown)
      }
      const p = payload.profile
      if (p) {
        const nums = p.payment_numbers ?? []
        setRetailerPaymentNumbersInput(nums.map((n) => n.value).join(", "))
        setDeskCountryCode((p.country_code ?? "").slice(0, 2))
        setDeskIsCountryRetailer(Boolean(p.is_country_retailer))
        if (
          p.liquidity_status === "active" ||
          p.liquidity_status === "busy" ||
          p.liquidity_status === "offline" ||
          p.liquidity_status === "low_liquidity"
        ) {
          setDeskLiquidityStatus(p.liquidity_status)
        }
        setDeskWhatsapp(p.whatsapp_number ?? "")
        setDeskContactPhone(p.contact_phone ?? "")
        setDeskPayeeNames(p.registered_payee_names ?? "")
      } else {
        setDeskIsCountryRetailer(true)
        const snapCc = String(op.snapshot?.profile?.fundingCountryCode ?? "")
          .trim()
          .toUpperCase()
          .slice(0, 2)
        setDeskCountryCode(snapCc.length === 2 ? snapCc : "UG")
        setDeskLiquidityStatus("active")
      }
    },
    [op.snapshot?.profile?.fundingCountryCode],
  )

  useEffect(() => {
    if (!retailerCreditDesk || authLoading || !user || isGuestSession) return
    let cancelled = false
    ;(async () => {
      setRetailerDeskLoading(true)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token || cancelled) return
        const profRes = await fetch("/api/user/retailer-profile", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        if (cancelled || !profRes.ok) return
        const profJson = (await profRes.json()) as {
          profile?: RetailerRow | null
          deskRegistrationComplete?: boolean
          paymentNumbersCooldown?: { canEditPaymentNumbers: boolean; nextEligibleAt: string | null }
        }
        applyRetailerProfileFromApi(profJson)
      } finally {
        if (!cancelled) setRetailerDeskLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [retailerCreditDesk, authLoading, user, isGuestSession, applyRetailerProfileFromApi])

  /** Same mobile-money → qualified retailer path as Level 1 (includes Level 2 non–credit-desk accounts). */
  const customerRetailFunding = useMemo(() => {
    const level = op.snapshot?.profile?.tradingUserLevel ?? 1
    if (level === 5) return false
    if (level === 1) return true
    if (level === 2) return !Boolean(op.snapshot?.profile?.retailerCreditSeller)
    return false
  }, [op.snapshot?.profile?.tradingUserLevel, op.snapshot?.profile?.retailerCreditSeller])

  /** Local MM: amount input is in corridor fiat (UG→UGX), not necessarily wallet display currency (often USD). */
  const localMmCorridorFiat = useMemo(() => {
    const cc = fundingCountryCodeInput.trim().toUpperCase().slice(0, 2)
    return cc.length === 2 ? corridorFiatForCountryIso2(cc) : null
  }, [fundingCountryCodeInput])

  const fundingAmountLabelCurrency =
    l1FundSource === "local" && localMmCorridorFiat ? localMmCorridorFiat : currency

  /** Step 2 desk matching — normalize ids so Tx fields + warning always align with selection. */
  const localMmSelectedDesk = useMemo(() => {
    return qualifiedRetailers.find((x) => String(x.id) === String(selectedRetailerId))
  }, [qualifiedRetailers, selectedRetailerId])

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
        withdrawal_pending_balance?: number
        total_earnings?: number
        active_container_earnings?: number
        container_withdrawable_earnings?: number
        lifetime_container_fees?: number
      }
      setMainBalance(Number(json.available_balance ?? 0))
      setWithdrawalPendingBalance(Number(json.withdrawal_pending_balance ?? 0))
      setTotalEarnings(Number(json.total_earnings ?? 0))
      setActiveContainerEarnings(Number(json.active_container_earnings ?? 0))
      setContainerWithdrawableEarnings(Number(json.container_withdrawable_earnings ?? 0))
      setContainerFeesPaid(Number(json.lifetime_container_fees ?? 0))
    })()
  }, [authLoading, user, isGuestSession])

  useEffect(() => {
    if (authLoading || !user || isGuestSession) return
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch("/api/user/referral", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const j = (await res.json()) as {
          referralCode?: string
          referralLink?: string
          refereeCount?: number
        }
        setReferralInfo({
          referralCode: String(j.referralCode ?? ""),
          referralLink: String(j.referralLink ?? ""),
          refereeCount: Number(j.refereeCount ?? 0),
        })
      } catch {
        /* ignore */
      }
    })()
  }, [authLoading, user, isGuestSession])

  useEffect(() => {
    if (isGuestSession || !user) return
    const b = op.snapshot?.userBalance
    if (!b) return
    setMainBalance(Number(b.available_balance ?? 0))
    setWithdrawalPendingBalance(Number(b.withdrawal_pending_balance ?? 0))
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
          customerRetailFunding?: boolean
          retailers?: RetailerRow[]
          requests?: RetailerFundingRequest[]
        }
        if ((json.userLevel ?? 1) === 2 && json.customerRetailFunding !== true) {
          setRetailerRows(json.retailers ?? [])
        }
        setFundRequests(json.requests ?? [])
      } catch {
        /* ignore */
      }
    })()
  }, [
    authLoading,
    user,
    isGuestSession,
    op.snapshot?.profile?.fundingCountryCode,
    op.snapshot?.profile?.tradingUserLevel,
    op.snapshot?.profile?.retailerCreditSeller,
  ])

  /** Level 5: preload admin funding + retailer directory so Wallet / Add Funds reflects pipelines without waiting on modals. */
  useEffect(() => {
    if (authLoading || !user || isGuestSession) return
    if ((op.snapshot?.profile?.tradingUserLevel ?? 1) !== 5) return
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const [rf, aq] = await Promise.all([
          fetch("/api/admin/retailer-funding", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          fetch("/api/admin/retailer-liquidity-topup", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
        ])
        if (rf.ok) {
          const fj = (await rf.json()) as { requests?: RetailerFundingRequest[]; retailers?: RetailerRow[] }
          setAdminFundingQueue(fj.requests ?? [])
          setAdminRetailerRows(fj.retailers ?? [])
        }
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
      } catch {
        /* ignore */
      }
    })()
  }, [authLoading, user, isGuestSession, op.snapshot?.profile?.tradingUserLevel])

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
          customerRetailFunding?: boolean
        }
        setFundRequests(j.requests ?? [])
        const lvl = j.userLevel ?? (currentUser?.level ?? 1)
        if (lvl === 2 && j.customerRetailFunding !== true) {
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
            const profJson = (await profRes.json()) as {
              profile?: RetailerRow | null
              deskRegistrationComplete?: boolean
              paymentNumbersCooldown?: { canEditPaymentNumbers: boolean; nextEligibleAt: string | null }
            }
            applyRetailerProfileFromApi(profJson)
          }
        }
        if (lvl === 5) {
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
              retailers?: RetailerRow[]
            }
            setAdminFundingQueue(fj.requests ?? [])
            setAdminRetailerRows(fj.retailers ?? [])
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
    op.snapshot?.profile?.fundingCountryCode,
    applyRetailerProfileFromApi,
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
          setActiveTab("container")
          break
        case "wallet":
          setActiveTab("wallet")
          break
        case "settings":
          setSettingsRequestedView(nav.view as SettingsView)
          setActiveTab("settings")
          break
        case "orders":
          setActiveTab("wallet")
          break
        case "expert-analysis":
          setActiveTab("wallstreet")
          showToast("Open Wallstreet for analysis — expert execution routes were retired.", "success")
          break
        default:
          break
      }
    },
    [router, showToast]
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

  // Navigate from Wallstreet — stay on Wallstreet with analysis overlay (no legacy live desk).
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
      setActiveTab("wallstreet")
      showToast(
        `${mode === "nex_auto" ? "Nex Auto-Trade" : "Manual trade"} overlay — ${coin.symbol} (${strategies.length} strategies)`,
        "success"
      )
    },
    [showToast]
  )

  const handleLiveAnalysisTrade = useCallback(
    (type: "buy" | "sell", amount: number) => {
      void (async () => {
        if (!liveAnalysis.coin) return
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          const token = session?.access_token
          if (!token) {
            showToast("Sign in to trade.", "error")
            return
          }
          const res = await fetch("/api/user/nexus-main/assert-sufficient", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ requiredUsd: amount }),
          })
          const out = (await res.json().catch(() => ({}))) as { error?: string }
          if (!res.ok) {
            showToast(out.error || "Insufficient Nexus Main balance for this Wallstreet trade.", "error")
            return
          }
          showToast(`${type.toUpperCase()} Order - ${liveAnalysis.coin.symbol} - $${amount}`, "success")
        } catch (e) {
          showToast(e instanceof Error ? e.message : "Trade validation failed.", "error")
        }
      })()
    },
    [liveAnalysis.coin, showToast],
  )

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
          const j = (await rf.json()) as {
            available_balance?: number
            withdrawal_pending_balance?: number
          }
          setMainBalance(Number(j.available_balance ?? 0))
          setWithdrawalPendingBalance(Number(j.withdrawal_pending_balance ?? 0))
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
      const out = (await res.json().catch(() => ({}))) as {
        error?: string
        code?: string
        nextEligibleAt?: string
        profile?: RetailerRow
      }
      if (res.status === 429 && out.code === "PAYMENT_NUMBERS_COOLDOWN") {
        const when = out.nextEligibleAt
          ? new Date(out.nextEligibleAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
          : ""
        showToast(
          when ? `${out.error ?? "Payment lines are on cooldown."} Eligible after ${when}.` : (out.error ?? "Cooldown active."),
          "error",
        )
        return
      }
      if (!res.ok) throw new Error(out.error || "Could not save retailer profile.")
      setRetailerRows((prev) => {
        const filtered = prev.filter((r) => r.id !== out.profile?.id)
        return out.profile ? [out.profile, ...filtered] : prev
      })
      const refresh = await fetch("/api/user/retailer-profile", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (refresh.ok) {
        const j = (await refresh.json()) as {
          profile?: RetailerRow | null
          deskRegistrationComplete?: boolean
          paymentNumbersCooldown?: { canEditPaymentNumbers: boolean; nextEligibleAt: string | null }
        }
        applyRetailerProfileFromApi(j)
      }
      setDeskEditPaymentLines(false)
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
    applyRetailerProfileFromApi,
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
      if ((currentUser?.level ?? 1) < 5) {
        showToast("Admin workflow requires profiles.trading_user_level = 5.", "error")
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
    [showToast, currentUser?.level]
  )

  const handleLoadQualifiedRetailers = useCallback(async () => {
    const amt = parseFloat(fundAmount)
    if (!(amt > 0) || Number.isNaN(amt)) {
      showToast("Enter the amount you will send.", "error")
      return
    }
    const cc = fundingCountryCodeInput.trim().toUpperCase().slice(0, 2)
    if (cc.length !== 2) {
      showToast("Enter your 2-letter country code (e.g. UG, KE).", "error")
      return
    }
    const net = fundMobileNetwork.trim()
    if (!net) {
      showToast("Choose your payment network first (MTN, Airtel, M-Pesa, …).", "error")
      return
    }
    if (!fundPayerName.trim() || !fundPayerPhone.trim()) {
      showToast("Enter sender name and sending mobile number.", "error")
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
      const fundingFiat = corridorFiatForCountryIso2(cc) ?? currency
      const qs = new URLSearchParams({
        amount: String(amt),
        country: cc,
        currency: fundingFiat,
        network: net,
      })
      const res = await fetch(`/api/user/qualified-retailers?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string; retailers?: QualifiedRetailer[] }
      if (!res.ok) throw new Error(out.error || "Could not load retailers.")
      const retailers = out.retailers ?? []
      setQualifiedRetailers(retailers)
      const only = retailers.length === 1 && retailers[0]?.id != null ? String(retailers[0].id) : ""
      /* Single desk: select immediately so payer sees Tx ID + confirm (no extra tap). */
      setSelectedRetailerId(only)
      setLocalMmRetailersSearched(true)
      setFundTxReference("")
      setFundNote("")
      setLocalMmWizardStep(2)
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load failed.", "error")
    } finally {
      setLoadingQualifiedRetailers(false)
    }
  }, [fundAmount, fundingCountryCodeInput, currency, fundMobileNetwork, fundPayerName, fundPayerPhone, showToast])

  const handleBackLocalMmWizard = useCallback(() => {
    setLocalMmWizardStep(1)
    setQualifiedRetailers([])
    setSelectedRetailerId("")
    setLocalMmRetailersSearched(false)
    setFundTxReference("")
    setFundNote("")
  }, [])

  /** Reset desk matching when corridor inputs change — do NOT tie to fundAmount or step 2 loses selection while payer enters Tx ID. */
  useEffect(() => {
    if (l1FundSource !== "local") return
    setQualifiedRetailers([])
    setSelectedRetailerId("")
    setLocalMmRetailersSearched(false)
    setLocalMmWizardStep(1)
  }, [fundingCountryCodeInput, fundMobileNetwork, l1FundSource])

  useEffect(() => {
    if (l1FundSource !== "local" || localMmWizardStep !== 2) return
    if (qualifiedRetailers.length !== 1 || selectedRetailerId) return
    const rid = qualifiedRetailers[0]?.id
    if (rid != null) setSelectedRetailerId(String(rid))
  }, [l1FundSource, localMmWizardStep, qualifiedRetailers, selectedRetailerId])

  useEffect(() => {
    if (showFundModal !== "add") setLocalMmWizardStep(1)
  }, [showFundModal])

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
    const amountRaw = parseFloat(fundAmount)
    /** Withdraw & local mobile-money funding: user types preferred fiat → ledger uses USD-normalized units. */
    const ccFund = fundingCountryCodeInput.trim().toUpperCase().slice(0, 2)
    const localFundingFiat = corridorFiatForCountryIso2(ccFund) ?? currency
    let ledgerUsd = amountRaw
    if (showFundModal === "withdraw") {
      ledgerUsd = localFiatUnitsToUsd(amountRaw, currency)
    } else if (showFundModal === "add" && l1FundSource === "local") {
      ledgerUsd = localFiatUnitsToUsd(amountRaw, localFundingFiat)
    }
    const amount = ledgerUsd
    const level = currentUser?.level ?? 1
    if (!(amount > 0) && !(showFundModal === "withdraw")) {
      if (showFundModal === "add" && customerRetailFunding && l1FundSource === "crypto") return
      if (showFundModal === "add" && customerRetailFunding && l1FundSource === "pick") return
      if (showFundModal === "add" && retailerCreditDesk) return
      if (showFundModal === "add" && level === 5) return
      if (showFundModal === "add" && customerRetailFunding && l1FundSource === "local") {
        showToast("Enter a valid funding amount on step 1.", "error")
        return
      }
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
          if (retailerCreditDesk && retailerOpsBlocked) {
            throw new Error(
              "You have pending local funding approvals. Clear or approve those requests before withdrawing Nexus balance.",
            )
          }
          const res = await fetch("/api/user/withdrawal/request", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              amount,
              currencyContext: "USD",
            }),
          })
          const out = (await res.json().catch(() => ({}))) as {
            error?: string
            balances?: { available_balance?: number; withdrawal_pending_balance?: number }
          }
          if (!res.ok) throw new Error(out.error || "Withdrawal failed")
          setMainBalance(Number(out.balances?.available_balance ?? mainBalance))
          setWithdrawalPendingBalance(Number(out.balances?.withdrawal_pending_balance ?? withdrawalPendingBalance))
          showToast(
            `${formatUserMoney(amount)} submitted — deducted from Nexus Main; pending Level 5 approval.`,
            "success",
          )
          setShowFundModal(null)
          setFundAmount("")
          setFundTxReference("")
          setFundNote("")
          return
        }

        if (showFundModal === "add") {
          if (!customerRetailFunding) {
            throw new Error(
              retailerCreditDesk
                ? "Use “Save retailer desk”, incoming queue actions, or “Submit crypto top-up” in this dialog."
                : "Use admin queue buttons for approvals — direct balance credit here is disabled.",
            )
          }
          if (l1FundSource !== "local") {
            throw new Error("Open “Local mobile money”, complete payment off-app, then use Confirm.")
          }
          if (localMmWizardStep !== 2) {
            throw new Error("Finish retailer matching on step 2 before confirming.")
          }
          if (!(amount > 0)) throw new Error("Enter the amount you funded.")
          if (!localMmSelectedDesk || !fundTxReference.trim()) {
            throw new Error("Pick a desk and enter your transaction ID / reference from your receipt.")
          }
          if (!fundPayerName.trim() || !fundPayerPhone.trim()) {
            throw new Error("Enter your sender name and sending mobile number exactly as shown to the retailer.")
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
              retailerId: localMmSelectedDesk.id,
              amount,
              txReference: fundTxReference,
              note: fundNote,
              mobileNetwork: fundMobileNetwork || null,
              fundChannel: "local_mobile",
              fundingCountryCode: ccSave.length === 2 ? ccSave : undefined,
              payerDisplayName: fundPayerName.trim(),
              payerPhone: fundPayerPhone.trim(),
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
          setLocalMmRetailersSearched(false)
          setLocalMmWizardStep(1)
          setShowFundModal(null)
          setFundAmount("")
          setFundNote("")
          setFundPayerName("")
          setFundPayerPhone("")
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
    localMmSelectedDesk,
    fundTxReference,
    fundNote,
    l1FundSource,
    fundMobileNetwork,
    fundPayerName,
    fundPayerPhone,
    fundingCountryCodeInput,
    retailerOpsBlocked,
    customerRetailFunding,
    retailerCreditDesk,
    formatUserMoney,
    withdrawalPendingBalance,
    currency,
    localMmWizardStep,
  ])

  const handleAdminFundingAction = useCallback(async (requestId: string, action: "approve" | "reject" | "resolve") => {
    if ((currentUser?.level ?? 1) < 5) {
      showToast("Admin queues require profiles.trading_user_level = 5.", "error")
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
  }, [showToast, currentUser?.level])

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const sidebarPanel = (
    <Sidebar coins={tradeCatalog.slice(0, 16)} portfolioTotal={mainBalance} portfolioChange={12.4} />
  )

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <Header
        activeTab={activeTab}
        onTabChange={handleHeaderTabChange}
        coins={headerSearchCoins}
        currentUser={currentUser ?? undefined}
        referral={referralInfo}
        onLogout={handleLogout}
        retailerCreditDesk={retailerCreditDesk}
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
                type="button"
                onClick={() => setActiveTab("wallstreet")}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80"
              >
                Wallstreet
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("container")}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80"
              >
                Container
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

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Nexus Main Balance</p>
            <p className="mt-1 font-mono text-lg font-bold">
              {showBalance ? formatUserMoney(mainBalance) : "••••"}
            </p>
            <p className="text-[11px] text-muted-foreground">Cashout and new container funding source.</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending withdrawal (frozen)</p>
            <p className="mt-1 font-mono text-lg font-bold text-amber-700 dark:text-amber-400">
              {showBalance ? formatUserMoney(withdrawalPendingBalance) : "••••"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Funds deducted from your Nexus Main Account at withdrawal request and temporarily held for automated
              processing. Funds are either released to your withdrawal destination upon approval or refunded back to your
              Nexus account if processing fails.
            </p>
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
        <div className="mt-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Deposit timing:</span> {PROCESSING_COPY.deposits}
          </p>
          <p className="mt-1">
            <span className="font-medium text-foreground">Withdrawal timing:</span> {PROCESSING_COPY.withdrawals}
          </p>
        </div>
      </div>

      {/* Add Fund / Withdraw Modal */}
      {showFundModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="flex h-[min(92dvh,700px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl sm:p-5">
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 pb-3 pt-4 sm:px-0 sm:pt-0 sm:pb-3">
              <h2 className="text-lg font-bold sm:text-xl">
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

            {showFundModal === "withdraw" ? null : retailerCreditDesk && retailerOpsBlocked ? (
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-muted-foreground">
                You have pending local funding requests from customers. Withdrawals from Nexus main balance are blocked
                until pending requests are cleared. You can still update your desk, approve queue items, or request liquidity
                from Admin.
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-0 [-webkit-overflow-scrolling:touch]">
            {showFundModal === "withdraw" ? null : customerRetailFunding && showFundModal === "add" ? (
              <div className="mb-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setL1FundSource("crypto")
                      setLocalMmWizardStep(1)
                    }}
                    className={`rounded-lg border-2 px-2 py-2 text-left text-[11px] font-semibold leading-tight transition-all sm:px-3 sm:py-2.5 sm:text-xs ${
                      l1FundSource === "crypto" ? "border-primary" : "border-border"
                    }`}
                  >
                    A — Crypto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setL1FundSource("local")
                      setLocalMmWizardStep(1)
                      setQualifiedRetailers([])
                      setSelectedRetailerId("")
                      setLocalMmRetailersSearched(false)
                      setFundTxReference("")
                      setFundNote("")
                    }}
                    className={`rounded-lg border-2 px-2 py-2 text-left text-[11px] font-semibold leading-tight transition-all sm:px-3 sm:py-2.5 sm:text-xs ${
                      l1FundSource === "local" ? "border-primary" : "border-border"
                    }`}
                  >
                    B — Local MM
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

                {l1FundSource === "local" && localMmWizardStep === 1 ? (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">Local MM · Step 1 of 2</p>
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Qualify
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Enter your country, network, amount, and sender details. Retailers are matched on the next screen.
                    </p>
                    <div className="space-y-2.5">
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Country</label>
                        <input
                          type="text"
                          maxLength={2}
                          value={fundingCountryCodeInput}
                          onChange={(e) => setFundingCountryCodeInput(e.target.value.toUpperCase())}
                          placeholder="UG"
                          autoComplete="country"
                          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm uppercase"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Network</label>
                        <select
                          value={fundMobileNetwork}
                          onChange={(e) => setFundMobileNetwork(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                        >
                          <option value="">Select network…</option>
                          <option value="MTN">MTN</option>
                          <option value="Airtel">Airtel</option>
                          <option value="MPesa">M-Pesa</option>
                          <option value="Orange">Orange</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          Funding amount ({fundingAmountLabelCurrency})
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={fundAmount}
                          onChange={(e) => setFundAmount(e.target.value)}
                          placeholder="0"
                          className="w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          Sender mobile number
                        </label>
                        <input
                          type="tel"
                          value={fundPayerPhone}
                          onChange={(e) => setFundPayerPhone(e.target.value)}
                          placeholder="+256…"
                          autoComplete="tel"
                          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          Sender name (as on MoMo)
                        </label>
                        <input
                          type="text"
                          value={fundPayerName}
                          onChange={(e) => setFundPayerName(e.target.value)}
                          placeholder="Full name"
                          autoComplete="name"
                          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={loadingQualifiedRetailers}
                      onClick={() => void handleLoadQualifiedRetailers()}
                      className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
                    >
                      {loadingQualifiedRetailers ? "Finding retailers…" : "Continue · find retailers"}
                    </button>
                  </div>
                ) : null}

                {l1FundSource === "local" && localMmWizardStep === 2 ? (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-2 sm:p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBackLocalMmWizard()}
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-semibold hover:bg-muted"
                      >
                        ← Edit details
                      </button>
                      <span className="text-[11px] font-semibold text-foreground">Step 2 of 2 · Choose desk</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                      <span className="rounded-md bg-background px-2 py-1 font-mono">
                        {fundingCountryCodeInput.trim().toUpperCase() || "—"}
                      </span>
                      <span className="rounded-md bg-background px-2 py-1">{fundMobileNetwork || "—"}</span>
                      <span className="rounded-md bg-background px-2 py-1 font-mono">
                        {formatLocalFiatAmount(parseFloat(fundAmount) || 0, fundingAmountLabelCurrency, locale)}
                      </span>
                    </div>

                    {!loadingQualifiedRetailers && localMmRetailersSearched && qualifiedRetailers.length === 0 ? (
                      <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-950 dark:text-amber-100 space-y-1.5">
                        <p className="font-medium">No desk matched this corridor yet.</p>
                        <p>
                          Common fixes: try <strong>Network → Other</strong> if the desk uses generic payment labels; lower the
                          amount; pick MTN vs Airtel to match the line you will pay (Uganda lines are matched by number prefix when
                          labels say “primary”).
                        </p>
                        <p className="text-muted-foreground">
                          Transaction reference appears after you select an available desk below — none qualify right now.
                        </p>
                      </div>
                    ) : null}

                    {qualifiedRetailers.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Available desks
                        </p>
                        <div className="grid max-h-[min(50vh,320px)] gap-2 overflow-y-auto sm:grid-cols-2">
                          {qualifiedRetailers.map((r) => {
                            const active = selectedRetailerId === r.id
                            const nums = (r.payment_numbers ?? [])
                              .map((p) => `${p.label ? `${p.label}: ` : ""}${p.value}`.trim())
                              .filter(Boolean)
                            const statusLabel = String(r.liquidity_status ?? "—")
                            const spend = typeof r.spendable_liquidity === "number" ? r.spendable_liquidity.toFixed(0) : "—"
                            const payee = String(r.registered_payee_names ?? "").trim()
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setSelectedRetailerId(r.id)}
                                className={`rounded-lg border p-2.5 text-left text-[11px] transition-colors ${
                                  active ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border bg-background hover:bg-muted/50"
                                }`}
                              >
                                <p className="font-semibold text-foreground">
                                  Desk · {String(r.country_code ?? "").toUpperCase() || "—"}
                                </p>
                                <p className="mt-1 font-mono text-[10px] text-muted-foreground line-clamp-3">
                                  {nums.length ? nums.join(" · ") : "Payment numbers on file"}
                                </p>
                                {payee ? (
                                  <p className="mt-1 line-clamp-2 text-[10px] text-foreground/90">Payee: {payee}</p>
                                ) : null}
                                <p className="mt-1 text-[10px]">
                                  <span className="rounded bg-muted px-1 py-0.5 uppercase">{statusLabel}</span>
                                  {" · "}
                                  <span className="text-muted-foreground">Avail ~${spend}</span>
                                  {typeof r.estimated_response_minutes === "number" ? (
                                    <span className="text-muted-foreground"> · ~{r.estimated_response_minutes} min</span>
                                  ) : null}
                                </p>
                                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                                  WA {r.whatsapp_number || "—"} · {r.contact_phone || "—"}
                                </p>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    {qualifiedRetailers.length > 0 ? (
                      <div className="space-y-3 border-t border-border/60 pt-3">
                        {localMmSelectedDesk ? (
                          <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-[11px] sm:text-xs">
                            <p className="font-semibold text-warning">Pay this desk only</p>
                            <p>
                              Numbers:{" "}
                              {(localMmSelectedDesk.payment_numbers ?? [])
                                .map((p) => `${p.label ? `${p.label}: ` : ""}${p.value}`.trim())
                                .join(" · ") || "(none)"}
                            </p>
                            <p>
                              Registered payee name(s): {localMmSelectedDesk.registered_payee_names || "Confirm with desk"}
                            </p>
                            <p>
                              WhatsApp / call: {localMmSelectedDesk.whatsapp_number || "—"} ·{" "}
                              {localMmSelectedDesk.contact_phone || "—"}
                            </p>
                            <p className="font-medium text-destructive">
                              Match names and numbers exactly before sending. Wrong destination voids the request.
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-950 dark:text-amber-50">
                            Tap one desk card above, then enter your transaction ID.
                          </div>
                        )}
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-foreground">
                            Transaction ID / reference (required)
                          </label>
                          <p className="mb-1.5 text-[10px] text-muted-foreground">
                            Pay in your MoMo app first, then paste the receipt or SMS transaction ID here so the retailer can
                            verify before approving.
                          </p>
                          <input
                            type="text"
                            inputMode="text"
                            autoComplete="off"
                            name="momo-tx-id"
                            value={fundTxReference}
                            onChange={(e) => setFundTxReference(e.target.value)}
                            placeholder="Paste transaction ID from receipt or SMS"
                            className="w-full min-h-[44px] rounded-md border-2 border-primary/40 bg-background px-3 py-2.5 font-mono text-base outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Optional memo</label>
                          <input
                            type="text"
                            value={fundNote}
                            onChange={(e) => setFundNote(e.target.value)}
                            placeholder="Note to retailer"
                            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {customerRetailFunding &&
                showFundModal === "add" &&
                !(l1FundSource === "local" && localMmWizardStep === 1) ? (
                <div className="max-h-24 space-y-1 overflow-y-auto rounded bg-muted/40 p-2 sm:max-h-28">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Recent requests</p>
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
                ) : null}
              </div>
            ) : null}

            {showFundModal === "withdraw" ? null : retailerCreditDesk && showFundModal === "add" ? (
              <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-semibold text-muted-foreground">Level 2 — retailer desk & liquidity</p>
                {retailerDeskLoading ? (
                  <p className="text-sm text-muted-foreground">Loading desk settings…</p>
                ) : null}
                {!retailerDeskLoading && deskRegistrationComplete && !deskEditPaymentLines ? (
                  <div className="space-y-2 rounded-md border border-border bg-background p-3 text-[12px]">
                    <p className="font-semibold text-foreground">Desk registered</p>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">MoMo / payment lines: </span>
                      <span className="font-mono">{retailerPaymentNumbersInput || "—"}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {deskCountryCode || "—"} · {deskIsCountryRetailer ? "in-country desk" : "not in-country"} · liquidity:{" "}
                      {deskLiquidityStatus}
                    </p>
                    {deskPayeeNames.trim() ? (
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Pay-to names: </span>
                        {deskPayeeNames}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      WhatsApp {deskWhatsapp || "—"} · Voice {deskContactPhone || "—"}
                    </p>
                    {paymentNumbersCooldown && !paymentNumbersCooldown.canEditPaymentNumbers && paymentNumbersCooldown.nextEligibleAt ? (
                      <p className="text-[11px] text-amber-800 dark:text-amber-200">
                        Changing MoMo / payment lines is limited to once per 7 days (next eligible{" "}
                        {new Date(paymentNumbersCooldown.nextEligibleAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        ). You can still update liquidity and contacts below; contact support for an urgent number reset.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setDeskEditPaymentLines(true)}
                      className="text-xs font-semibold text-primary underline underline-offset-2"
                    >
                      Edit desk details
                    </button>
                  </div>
                ) : null}
                {!retailerDeskLoading && (!deskRegistrationComplete || deskEditPaymentLines) ? (
                  <>
                    {deskRegistrationComplete ? (
                      <button
                        type="button"
                        onClick={() => setDeskEditPaymentLines(false)}
                        className="text-[11px] text-muted-foreground underline"
                      >
                        Back to summary
                      </button>
                    ) : null}
                    <label className="flex items-center gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={deskIsCountryRetailer}
                        onChange={(e) => setDeskIsCountryRetailer(e.target.checked)}
                      />
                      <span>
                        Offer in-country liquidity (required for Add Funds — customers only see desks with this on + country +
                        active liquidity)
                      </span>
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
                  </>
                ) : null}
                <div className="rounded border border-border bg-background p-2">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Registered retail desks (network)</p>
                  <p className="mb-2 text-[10px] text-muted-foreground">
                    Same directory admins see. Enable country + liquidity + payment lines so you appear to matching customers.
                  </p>
                  <div className="max-h-36 space-y-1 overflow-y-auto text-[11px]">
                    {retailerRows.length === 0 ? (
                      <p className="text-muted-foreground">No desks loaded — refresh or check Level 2 + retailer desk flag.</p>
                    ) : (
                      retailerRows.map((row) => (
                        <div
                          key={row.id}
                          className="flex flex-col gap-0.5 border-b border-border/50 py-1 last:border-0 md:flex-row md:items-center md:justify-between"
                        >
                          <span className="font-medium">
                            {row.profile_email ?? `${row.user_id.slice(0, 8)}…`}
                            {row.user_id === user?.id ? (
                              <span className="ml-1 rounded bg-primary/15 px-1 text-[10px] text-primary">you</span>
                            ) : null}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {row.country_code ?? "—"} · {row.liquidity_status ?? "—"} · basin $
                            {Number(row.credit_basin ?? 0).toFixed(0)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
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

            </div>

            {showFundModal === "add" &&
            customerRetailFunding &&
            l1FundSource === "local" &&
            localMmWizardStep === 1 ? (
              <div className="shrink-0 border-t border-border/70 bg-card px-4 py-2.5 text-center sm:px-0">
                <p className="text-[10px] text-muted-foreground">
                  Next: tap <span className="font-semibold text-foreground">Continue · find retailers</span> above — nothing to
                  confirm here yet.
                </p>
              </div>
            ) : (
            <div className="shrink-0 space-y-2 border-t border-border/70 bg-card px-4 pb-3 pt-3 sm:px-0">
            {(showFundModal === "withdraw" ||
              retailerCreditDesk ||
              (customerRetailFunding && l1FundSource !== "local")) && (
              <div className="mb-0">
                <label className="mb-1 block text-xs font-medium text-muted-foreground sm:text-sm">
                  {showFundModal === "withdraw"
                    ? `Withdraw amount (${currency})`
                    : retailerCreditDesk
                      ? `Requested admin top-up (${currency})`
                      : `Funding amount in ${currency} (match what you send)`}
                </label>
                <input
                  type="number"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder={`0 (${currency})`}
                  className="w-full rounded-lg border border-border bg-background py-2 px-3 font-mono text-base outline-none transition-colors focus:border-primary sm:py-2.5 sm:text-lg"
                />
                <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground sm:text-[11px]">
                  Amounts convert to ledger USD internally ({currency}).
                </p>
                {showFundModal === "withdraw" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Available:{" "}
                    {showBalance ? formatUserMoney(mainBalance) : "••••"}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-1.5 sm:gap-2">
                  {[50, 100, 250, 500].map((usdPreset) => (
                    <button
                      key={usdPreset}
                      type="button"
                      onClick={() =>
                        setFundAmount(String(Math.round(convertFromUsd(usdPreset, currency) * 100) / 100))
                      }
                      className="min-w-[4rem] flex-1 rounded-lg bg-muted py-1.5 text-[10px] font-medium hover:bg-muted/80 sm:py-2 sm:text-xs"
                    >
                      ≈{formatUserMoney(usdPreset)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {showFundModal === "add" &&
              customerRetailFunding &&
              l1FundSource === "local" &&
              localMmWizardStep === 2 ? (
                <p className="text-[10px] text-muted-foreground">
                  {!localMmSelectedDesk
                    ? "Select a desk above."
                    : !fundTxReference.trim()
                      ? "Enter your transaction ID / reference from the receipt."
                      : !fundPayerName.trim() || !fundPayerPhone.trim()
                        ? "Sender name and phone are required (step 1)."
                        : !fundMobileNetwork.trim() || fundingCountryCodeInput.trim().length !== 2
                          ? "Country and network must be set (use Edit details if needed)."
                          : !(parseFloat(fundAmount) > 0)
                            ? "Funding amount is missing — use Edit details."
                            : "Ready — confirm to notify the retailer."}
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleFundSubmit}
                disabled={
                  isFundProcessing ||
                  (showFundModal === "withdraw" && (!fundAmount || parseFloat(fundAmount) <= 0)) ||
                  (showFundModal === "add" && customerRetailFunding && l1FundSource !== "local") ||
                  (showFundModal === "add" && retailerCreditDesk) ||
                  (showFundModal === "add" && (currentUser?.level ?? 1) === 5) ||
                  (showFundModal === "add" &&
                    customerRetailFunding &&
                    l1FundSource === "local" &&
                    (localMmWizardStep !== 2 ||
                      !localMmSelectedDesk ||
                      !fundTxReference.trim() ||
                      !fundPayerName.trim() ||
                      !fundPayerPhone.trim() ||
                      !fundMobileNetwork.trim() ||
                      fundingCountryCodeInput.trim().length !== 2 ||
                      !(parseFloat(fundAmount) > 0)))
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
                  fundAmount.trim()
                    ? `Withdraw · ${formatLocalFiatAmount(parseFloat(fundAmount) || 0, currency, locale)}`
                    : "Withdraw"
                ) : customerRetailFunding && l1FundSource === "local" ? (
                  "Confirm payment sent"
                ) : customerRetailFunding ? (
                  "Choose Local path to confirm"
                ) : (
                  "Add Funds"
                )}
              </button>
              {showFundModal === "add" && customerRetailFunding && l1FundSource === "crypto" ? (
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
            )}
          </div>
        </div>
      )}

      {/* Main Content — Container desk + Wallstreet assistant only (no legacy live/markets decks). */}
      <div className="mx-auto max-w-[1600px] px-4 pb-24 md:pb-4">
        {activeTab === "container" && (
          <div className="flex flex-col gap-4 rounded-2xl bg-[#020308]/80 p-2 ring-1 ring-white/[0.04] lg:flex-row lg:p-3">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebarPanel}</div>
            <main className="min-w-0 flex-1">
              <ContainerMode
                userLevel={(currentUser?.level ?? 1) as 1 | 2 | 3 | 4 | 5}
                retailerCreditSeller={Boolean(op.snapshot?.profile?.retailerCreditSeller)}
                retailerLiquidityOpsBlocked={retailerOpsBlocked}
              />
            </main>
          </div>
        )}

        {activeTab === "wallstreet" && (
          <div className="relative flex flex-col gap-4 lg:flex-row">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebarPanel}</div>
            <main className="relative min-w-0 flex-1">
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
              {liveAnalysis.active && liveAnalysis.coin ? (
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
              ) : null}
            </main>
          </div>
        )}

        {activeTab === "wallet" && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebarPanel}</div>
            <main className="min-w-0 flex-1">
              <WalletScreen
                coins={tradeCatalog.slice(0, 24)}
                tradingUserLevel={currentUser?.level ?? 1}
                retailerCreditDesk={retailerCreditDesk}
                isGuestSession={isGuestSession}
              />
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
                retailerCreditDesk={retailerCreditDesk}
              />
            </main>
          </div>
        )}
      </div>

      {!isGuestSession && (currentUser?.level ?? 1) === 5 && (
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
