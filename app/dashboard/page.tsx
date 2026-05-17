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
import { useMarketPriceAuthority } from "@/hooks/use-market-price-authority"
import { LiveAnalysisOverlay } from "@/components/dashboard/live-analysis-overlay"
import { ContainerMode } from "@/components/dashboard/container-mode"
import { RetailBalanceHomePanels } from "@/components/dashboard/retail-balance-home-panels"
import { ContainerDeskSection } from "@/components/dashboard/container-desk-section"
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
import { LaunchStatusBanner } from "@/components/dashboard/launch-status-banner"
import { NotificationCenterScreen } from "@/components/dashboard/notification-center-screen"
import { PROCESSING_COPY } from "@/lib/nexus-financial-policy"
import {
  corridorFiatForCountryIso2,
  formatLocalFiatAmount,
  formatMinDepositForCustomer,
  localFiatUnitsToUsd,
  minDepositLocalAmount,
} from "@/lib/currency-display"
import { localizeFundingWithdrawalApiMessage } from "@/lib/i18n/localize-funding-withdrawal-api-message"
import { FundingPaymentPanel, type L1FundSource } from "@/components/dashboard/funding-payment-panel"
import {
  PaymentReferenceFields,
  RetailerPaymentInstructionPanel,
} from "@/components/dashboard/mobile-money-payment-instructions"
import { TreasuryPoolsPanel } from "@/components/dashboard/treasury-pools-panel"
import { getOperationalRoleHint } from "@/lib/operational-role-hint"
import { parseUgAirtelMerchantDesk, parseUgMtnMobileDesk } from "@/lib/retailer-payment-templates"

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

type QualifiedRetailer = RetailerRow & {
  spendable_liquidity?: number
  qualification_verified_desk?: boolean
}

type OfficialCorridorFallback = {
  id: string
  payee_display_name: string
  payment_numbers?: Array<{ label?: string; value?: string }>
  whatsapp_number?: string | null
  contact_phone?: string | null
  notice?: string
  source?: string
}

type RetailerFundingRequest = {
  id: string
  retailer_id?: string | null
  official_corridor_route_id?: string | null
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
  const roleHint = useMemo(() => getOperationalRoleHint(user, op.snapshot), [user, op.snapshot])
  /** Level-5 liquidity admin or designated Level-2 retailer credit desk — Assets-only operational workspace (no trading Wallstreet/Container). */
  const operationalWorkspace = useMemo(() => {
    if (op.snapshot?.profile) {
      const lvl = op.snapshot.profile.tradingUserLevel ?? 1
      return lvl === 5 || (lvl === 2 && Boolean(op.snapshot.profile.retailerCreditSeller))
    }
    return Boolean(roleHint?.isOperationalDesk)
  }, [op.snapshot?.profile, roleHint?.isOperationalDesk])
  const opsDeskBootstrapping =
    Boolean(user) &&
    !isGuestSession &&
    op.isLoading &&
    !op.snapshot?.profile &&
    Boolean(roleHint?.isOperationalDesk)

  const activityUserId = user?.id ?? "guest"
  const { formatUserMoney, currency, locale, t } = useUserPreferences()
  const testimonialNotif = useDashboardTestimonialNotifs({
    enabled: Boolean(user) && !isGuestSession,
    userId: user?.id,
    formatUserMoney,
  })
  const [activeTab, setActiveTab] = useState("container")
  useEffect(() => {
    if (activeTab !== "wallet") return
    setActiveTab(operationalWorkspace ? "desk" : "notifications")
  }, [activeTab, operationalWorkspace])

  useEffect(() => {
    if (activeTab !== "desk" || operationalWorkspace) return
    setActiveTab("container")
  }, [activeTab, operationalWorkspace])

  const tradeView: DashboardTradeView = "overview"
  const [settingsRequestedView, setSettingsRequestedView] = useState<SettingsView | null>(null)
  /** Deep-link / notification → operational support thread (wallet Assets). */
  const [supportThreadFocusId, setSupportThreadFocusId] = useState<string | null>(null)
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState("BTC")
  const [showBalance, setShowBalance] = useState(true)
  const [mainBalance, setMainBalance] = useState(0)
  const [retailBalance, setRetailBalance] = useState(0)
  const [treasuryPoolUsd, setTreasuryPoolUsd] = useState<number | null>(null)
  const [treasuryPoolFormatted, setTreasuryPoolFormatted] = useState("")
  const [treasuryReserveUsd, setTreasuryReserveUsd] = useState<number | null>(null)
  const [treasuryReserveFormatted, setTreasuryReserveFormatted] = useState("")
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
  const [showFundModal, setShowFundModal] = useState<"add" | "withdraw" | null>(null)
  const [fundAmount, setFundAmount] = useState("")
  const [isFundProcessing, setIsFundProcessing] = useState(false)
  const [withdrawalEligibility, setWithdrawalEligibility] = useState<{
    minUsd: number
    maxUsd: number
    cooldownActive: boolean
    msRemaining: number
    nextEligibleAt: string | null
    totalBalanceUsd: number
  } | null>(null)
  const [fundTxReference, setFundTxReference] = useState("")
  const [fundTxRefError, setFundTxRefError] = useState<string | null>(null)
  const [fundNote, setFundNote] = useState("")
  const [fundPayerName, setFundPayerName] = useState("")
  const [fundPayerPhone, setFundPayerPhone] = useState("")
  const [selectedRetailerId, setSelectedRetailerId] = useState("")
  const [retailerRows, setRetailerRows] = useState<RetailerRow[]>([])
  const [fundRequests, setFundRequests] = useState<RetailerFundingRequest[]>([])
  const [retailerPaymentNumbersInput, setRetailerPaymentNumbersInput] = useState("")
  const [l1FundSource, setL1FundSource] = useState<L1FundSource>("crypto")
  const [fundPaymentProofDataUrl, setFundPaymentProofDataUrl] = useState<string | null>(null)
  const [fundPaymentProofPreview, setFundPaymentProofPreview] = useState<string | null>(null)
  const [fundingCountryCodeInput, setFundingCountryCodeInput] = useState("")
  const [fundMobileNetwork, setFundMobileNetwork] = useState("")
  const [qualifiedRetailers, setQualifiedRetailers] = useState<QualifiedRetailer[]>([])
  /** When no desk qualifies, Level-5-configured official company receive line (same country/network). */
  const [officialCorridorFallback, setOfficialCorridorFallback] = useState<OfficialCorridorFallback | null>(null)
  const [selectedOfficialRouteId, setSelectedOfficialRouteId] = useState<string | null>(null)
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

  const { marketFeed: authorityFeed } = useMarketPriceAuthority()
  const marketFeed: MarketFeedState = useMemo(
    () => ({
      status: authorityFeed.status,
      gainers: authorityFeed.gainers,
      volumeLeaders: authorityFeed.volumeLeaders,
      catalog: authorityFeed.catalog,
      updatedAt: authorityFeed.updatedAt,
    }),
    [authorityFeed]
  )

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
      let tab = snap.activeTab
      if (tab === "wallet") tab = "notifications"
      setActiveTab(tab)
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

    const coerceTab = (tab: string) => {
      let t = tab === "wallet" ? "notifications" : tab
      if (operationalWorkspace) {
        if (t === "notifications" || t === "container" || t === "wallstreet") t = "desk"
      }
      return t
    }
    const tab = coerceTab(parsed.activeTab)

    setActiveTab(tab)
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
    const nextSnap = buildActivitySnapshot(activityUserId, {
      activeTab: tab,
      tradeView: parsed.tradeView,
      selectedCoinSymbol: parsed.selectedCoinSymbol,
      showBalance: parsed.showBalance,
      liveAnalysis: resolvedLive,
    })
    writeDashboardActivity(nextSnap)
    activityLastSerializedRef.current = JSON.stringify(nextSnap)
  }, [
    user?.id,
    isGuestSession,
    operationalWorkspace,
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

  const tradingLevel = op.snapshot?.profile?.tradingUserLevel ?? 1
  /** Institutional treasury workspace: no trader/container/exchange surfaces in the balance header. */
  const level5Operational = operationalWorkspace && tradingLevel === 5
  /** Regional liquidity desk: only Nexus Main + Retail Balance in the dashboard balance header. */
  const retailerOperationalHeader = operationalWorkspace && retailerCreditDesk
  const showRetailBalancePanels = !operationalWorkspace && activeTab === "container"

  const opsWorkspaceBootedRef = useRef(false)
  useEffect(() => {
    opsWorkspaceBootedRef.current = false
  }, [user?.id])
  /** Land operational roles on Desk (command center). */
  useEffect(() => {
    if (authLoading || !user || isGuestSession || !operationalWorkspace) return
    if (!opsWorkspaceBootedRef.current) {
      opsWorkspaceBootedRef.current = true
      setActiveTab("desk")
    }
  }, [authLoading, user, isGuestSession, operationalWorkspace])

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
    l1FundSource === "local" && localMmCorridorFiat
      ? localMmCorridorFiat
      : l1FundSource === "airtel"
        ? localMmCorridorFiat ?? corridorFiatForCountryIso2("UG") ?? "UGX"
        : currency

  const customerMinDepositDisplay = useMemo(() => {
    const cur =
      showFundModal === "withdraw"
        ? currency
        : l1FundSource === "local" && localMmCorridorFiat
          ? localMmCorridorFiat
          : l1FundSource === "airtel"
            ? fundingAmountLabelCurrency
            : l1FundSource === "crypto"
              ? "USD"
              : currency
    return formatMinDepositForCustomer(cur, locale || "en-US")
  }, [showFundModal, currency, l1FundSource, localMmCorridorFiat, fundingAmountLabelCurrency, locale])

  const validateFundTxReferenceOnBlur = useCallback(async () => {
    const ref = fundTxReference.trim()
    if (ref.length < 4) {
      setFundTxRefError(null)
      return
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch("/api/user/funding-reference/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reference: ref }),
      })
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
      if (out.ok) {
        setFundTxRefError(null)
        return
      }
      setFundTxRefError(
        localizeFundingWithdrawalApiMessage(
          typeof out.message === "string" ? out.message : t("funding.field.txRefError"),
          t,
        ),
      )
    } catch {
      setFundTxRefError(null)
    }
  }, [fundTxReference, t])

  /** Step 2 desk matching — normalize ids so Tx fields + warning always align with selection. */
  const localMmSelectedDesk = useMemo(() => {
    return qualifiedRetailers.find((x) => String(x.id) === String(selectedRetailerId))
  }, [qualifiedRetailers, selectedRetailerId])

  const localMmSelectedOfficial = useMemo(() => {
    if (!selectedOfficialRouteId || !officialCorridorFallback) return null
    return officialCorridorFallback.id === selectedOfficialRouteId ? officialCorridorFallback : null
  }, [officialCorridorFallback, selectedOfficialRouteId])

  const localMmMtnMobile = useMemo(() => {
    if (!localMmSelectedDesk || fundMobileNetwork !== "MTN") return null
    return parseUgMtnMobileDesk(
      localMmSelectedDesk.payment_numbers,
      localMmSelectedDesk.registered_payee_names,
    )
  }, [localMmSelectedDesk, fundMobileNetwork])

  const localMmAirtelMerchant = useMemo(() => {
    if (!localMmSelectedDesk || fundMobileNetwork === "MTN") return null
    return parseUgAirtelMerchantDesk(
      localMmSelectedDesk.payment_numbers,
      localMmSelectedDesk.registered_payee_names,
    )
  }, [localMmSelectedDesk, fundMobileNetwork])

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
        retail_balance?: number
        withdrawal_pending_balance?: number
        total_earnings?: number
        active_container_earnings?: number
        active_container_earnings_resolved?: number
        container_session_accrual_usd?: number
        container_withdrawable_earnings?: number
        lifetime_container_fees?: number
      }
      setMainBalance(Number(json.available_balance ?? 0))
      setRetailBalance(Number(json.retail_balance ?? 0))
      setWithdrawalPendingBalance(Number(json.withdrawal_pending_balance ?? 0))
      setTotalEarnings(Number(json.total_earnings ?? 0))
      setActiveContainerEarnings(Number(json.active_container_earnings ?? 0))
      setContainerWithdrawableEarnings(Number(json.container_withdrawable_earnings ?? 0))
      setContainerFeesPaid(Number(json.lifetime_container_fees ?? 0))
    })()
  }, [authLoading, user, isGuestSession])

  useEffect(() => {
    if (authLoading || !user || isGuestSession || !level5Operational) return
    let cancelled = false
    const loadTreasury = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token || cancelled) return
        const res = await fetch("/api/admin/treasury", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        if (!res.ok || cancelled) return
        const j = (await res.json()) as {
          treasury?: { usd?: number; usdFormatted?: string }
          pools?: {
            MAIN_TREASURY?: { usd?: number; usdFormatted?: string }
            OPERATIONAL?: { usd?: number; usdFormatted?: string }
          }
        }
        const autoUsd = Number(j.pools?.MAIN_TREASURY?.usd ?? j.treasury?.usd ?? 0)
        const reserveUsd = Number(j.pools?.OPERATIONAL?.usd ?? 0)
        setTreasuryPoolUsd(Number.isFinite(autoUsd) ? autoUsd : 0)
        setTreasuryPoolFormatted(
          String(j.pools?.MAIN_TREASURY?.usdFormatted ?? j.treasury?.usdFormatted ?? "").trim(),
        )
        setTreasuryReserveUsd(Number.isFinite(reserveUsd) ? reserveUsd : 0)
        setTreasuryReserveFormatted(String(j.pools?.OPERATIONAL?.usdFormatted ?? "").trim())
      } catch {
        /* ignore */
      }
    }
    void loadTreasury()
    const id = window.setInterval(loadTreasury, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [authLoading, user, isGuestSession, level5Operational])

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

  const runContainerFlowAction = useCallback(
    async (action: "extract" | "transfer_to_main") => {
      if (isContainerFlowBusy) return
      try {
        setIsContainerFlowBusy(true)
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error(t("withdrawal.error.sessionExpired"))

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
        if (!res.ok) throw new Error(out.error?.trim() || t("funding.container.actionError"))
        setMainBalance(Number(out.balances?.available_balance ?? mainBalance))
        setActiveContainerEarnings(
          Number(out.balances?.active_container_earnings ?? activeContainerEarnings)
        )
        setContainerWithdrawableEarnings(
          Number(
            out.balances?.container_withdrawable_earnings ?? containerWithdrawableEarnings
          )
        )
        if (action === "extract") {
          setContainerFeesPaid((prev) => prev + Number(out.feeAmount ?? 0))
          showToast(
            t("funding.container.extractToast").replace(
              "{{amount}}",
              formatUserMoney(Number(out.creditedAmount ?? 0)),
            ),
            "success",
          )
        } else {
          showToast(
            t("funding.container.transferToast").replace(
              "{{amount}}",
              formatUserMoney(Number(out.transferAmount ?? 0)),
            ),
            "success",
          )
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("funding.container.actionError"), "error")
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
      t,
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

  const handleHeaderTabChange = useCallback(
    (tab: string) => {
      if (operationalWorkspace && (tab === "container" || tab === "wallstreet")) {
        showToast("Trading and execution views are disabled for your operational role. Use Desk or Settings.", "error")
        return
      }
      setActiveTab(tab)
      setSettingsRequestedView(null)
    },
    [operationalWorkspace, showToast],
  )

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
          if (operationalWorkspace) {
            setActiveTab("desk")
          } else {
            setSettingsRequestedView("deposit-withdraw")
            setActiveTab("settings")
          }
          break
        case "notifications":
          setActiveTab("notifications")
          break
        case "desk":
          setActiveTab("desk")
          break
        case "settings":
          setSettingsRequestedView(nav.view as SettingsView)
          setActiveTab("settings")
          break
        case "orders":
          setSettingsRequestedView("exchanges")
          setActiveTab("settings")
          break
        case "support_thread":
          if (operationalWorkspace) {
            setSupportThreadFocusId(nav.threadId)
            setActiveTab("desk")
          } else {
            setActiveTab("settings")
            showToast("For account help, open Settings and use Contact Support.", "success")
          }
          break
        case "expert-analysis":
          setActiveTab("wallstreet")
          showToast("Open Wallstreet for analysis — expert execution routes were retired.", "success")
          break
        default:
          break
      }
    },
    [operationalWorkspace, showToast],
  )

  useEffect(() => {
    if (typeof window === "undefined" || authLoading) return
    try {
      const u = new URL(window.location.href)
      const raw = u.searchParams.get("supportThread")
      if (!raw?.trim()) return
      const tid = raw.trim()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tid)) return
      setSupportThreadFocusId(tid)
      setActiveTab(operationalWorkspace ? "desk" : "settings")
      u.searchParams.delete("supportThread")
      const qs = u.searchParams.toString()
      window.history.replaceState({}, "", u.pathname + (qs ? `?${qs}` : ""))
    } catch {
      /* ignore */
    }
  }, [authLoading, operationalWorkspace])

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
      const out = (await res.json().catch(() => ({}))) as {
        error?: string
        retailers?: QualifiedRetailer[]
        official_fallback?: OfficialCorridorFallback | null
      }
      if (!res.ok) throw new Error(out.error || "Could not load retailers.")
      const retailers = out.retailers ?? []
      setOfficialCorridorFallback(out.official_fallback ?? null)
      setSelectedOfficialRouteId(null)
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
    setOfficialCorridorFallback(null)
    setSelectedOfficialRouteId(null)
    setSelectedRetailerId("")
    setLocalMmRetailersSearched(false)
    setFundTxReference("")
    setFundNote("")
  }, [])

  /** Reset desk matching when corridor inputs change — do NOT tie to fundAmount or step 2 loses selection while payer enters Tx ID. */
  useEffect(() => {
    if (l1FundSource !== "local") return
    setQualifiedRetailers([])
    setOfficialCorridorFallback(null)
    setSelectedOfficialRouteId(null)
    setSelectedRetailerId("")
    setLocalMmRetailersSearched(false)
    setLocalMmWizardStep(1)
  }, [fundingCountryCodeInput, fundMobileNetwork, l1FundSource])

  useEffect(() => {
    if (l1FundSource !== "local" || localMmWizardStep !== 2) return
    if (qualifiedRetailers.length !== 1 || selectedRetailerId || selectedOfficialRouteId) return
    const rid = qualifiedRetailers[0]?.id
    if (rid != null) setSelectedRetailerId(String(rid))
  }, [l1FundSource, localMmWizardStep, qualifiedRetailers, selectedRetailerId, selectedOfficialRouteId])

  useEffect(() => {
    if (l1FundSource !== "local" || localMmWizardStep !== 2) return
    if (qualifiedRetailers.length > 0 || !officialCorridorFallback?.id || selectedOfficialRouteId || selectedRetailerId) {
      return
    }
    setSelectedOfficialRouteId(officialCorridorFallback.id)
  }, [
    l1FundSource,
    localMmWizardStep,
    qualifiedRetailers.length,
    officialCorridorFallback,
    selectedOfficialRouteId,
    selectedRetailerId,
  ])

  useEffect(() => {
    if (showFundModal !== "add") setLocalMmWizardStep(1)
  }, [showFundModal])

  useEffect(() => {
    if (!showFundModal) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
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

  useEffect(() => {
    if (isGuestSession || !user || operationalWorkspace) {
      setWithdrawalEligibility(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token || cancelled) return
        const res = await fetch("/api/user/withdrawal/eligibility", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        if (!res.ok || cancelled) return
        const j = (await res.json().catch(() => ({}))) as {
          minUsd?: number
          maxUsd?: number
          cooldownActive?: boolean
          msRemaining?: number
          nextEligibleAt?: string | null
          totalBalanceUsd?: number
        }
        if (cancelled) return
        setWithdrawalEligibility({
          minUsd: Number(j.minUsd ?? 0),
          maxUsd: Number(j.maxUsd ?? 0),
          cooldownActive: Boolean(j.cooldownActive),
          msRemaining: Number(j.msRemaining ?? 0),
          nextEligibleAt: j.nextEligibleAt ?? null,
          totalBalanceUsd: Number(j.totalBalanceUsd ?? 0),
        })
      } catch {
        if (!cancelled) setWithdrawalEligibility(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isGuestSession, user, operationalWorkspace])

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
    } else if (showFundModal === "add" && l1FundSource === "airtel") {
      const ccAirtel = fundingCountryCodeInput.trim().toUpperCase().slice(0, 2)
      const airtelFiat =
        (ccAirtel.length === 2 ? corridorFiatForCountryIso2(ccAirtel) : null) ??
        corridorFiatForCountryIso2("UG") ??
        "UGX"
      ledgerUsd = localFiatUnitsToUsd(amountRaw, airtelFiat)
    }
    const amount = ledgerUsd
    const level = currentUser?.level ?? 1
    if (!(amount > 0) && !(showFundModal === "withdraw")) {
      if (showFundModal === "add" && customerRetailFunding && l1FundSource === "crypto") return
      if (showFundModal === "add" && customerRetailFunding && l1FundSource === "pick") return
      if (showFundModal === "add" && retailerCreditDesk) return
      if (showFundModal === "add" && level === 5) return
      if (showFundModal === "add" && customerRetailFunding && l1FundSource === "local") {
        showToast(t("funding.error.validAmountStep1"), "error")
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
        if (!token) throw new Error(t("withdrawal.error.sessionExpired"))

        if (showFundModal === "withdraw") {
          if (!(amount > 0)) throw new Error(t("withdrawal.error.enterAmount"))
          if (amount > mainBalance) throw new Error(t("withdrawal.error.insufficientBalance"))
          if (retailerCreditDesk && retailerOpsBlocked) {
            throw new Error(t("withdrawal.error.retailerPendingBlocksWithdraw"))
          }
          const res = await fetch("/api/user/withdrawal/request", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              amount,
              currencyContext: currency,
            }),
          })
          const out = (await res.json().catch(() => ({}))) as {
            error?: string
            balances?: { available_balance?: number; withdrawal_pending_balance?: number }
          }
          if (!res.ok) throw new Error(localizeFundingWithdrawalApiMessage(out.error, t))
          setMainBalance(Number(out.balances?.available_balance ?? mainBalance))
          setWithdrawalPendingBalance(Number(out.balances?.withdrawal_pending_balance ?? withdrawalPendingBalance))
          showToast(t("withdrawal.toast.success"), "success")
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
                ? t("funding.error.useDeskOrAdminQueue")
                : t("funding.error.useAdminQueue"),
            )
          }
          if (l1FundSource === "crypto") {
            if (!(amount > 0)) throw new Error(t("funding.error.enterFundedAmount"))
            if (!fundTxReference.trim()) throw new Error(t("funding.error.pickDeskAndTxRef"))
            const res = await fetch("/api/user/crypto-deposit", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                amountUsd: amount,
                txHash: fundTxReference.trim(),
              }),
            })
            const out = (await res.json().catch(() => ({}))) as {
              error?: string
              deposit?: { status?: string; failure_reason?: string | null }
              verifyMessage?: string
            }
            if (!res.ok) {
              throw new Error(localizeFundingWithdrawalApiMessage(out.error || "Could not submit crypto deposit", t))
            }
            const st = String(out.deposit?.status ?? "")
            if (st === "credited") {
              showToast(t("funding.toast.cryptoCredited"), "success")
              setFundTxReference("")
              setFundNote("")
              setFundAmount("")
              setShowFundModal(null)
            } else if (st === "failed") {
              throw new Error(out.deposit?.failure_reason || out.verifyMessage || t("funding.error.fundActionFailed"))
            } else {
              showToast(t("funding.toast.cryptoVerifying"), "success")
              setFundTxReference("")
            }
            setL1FundSource("crypto")
            return
          }

          if (l1FundSource === "airtel") {
            if (!(amount > 0)) throw new Error(t("funding.error.enterFundedAmount"))
            if (!fundTxReference.trim()) throw new Error(t("funding.error.pickDeskAndTxRef"))
            if (!fundPayerName.trim() || !fundPayerPhone.trim()) {
              throw new Error(t("funding.error.senderIdentity"))
            }
            const ccAirtel = fundingCountryCodeInput.trim().toUpperCase().slice(0, 2)
            const airtelFiat =
              (ccAirtel.length === 2 ? corridorFiatForCountryIso2(ccAirtel) : null) ??
              corridorFiatForCountryIso2("UG") ??
              "UGX"
            const res = await fetch("/api/user/retailer-funding", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                amount,
                amountInputLocal: amountRaw,
                inputCurrency: airtelFiat,
                txReference: fundTxReference.trim(),
                fundChannel: "admin_airtel_ug",
                payerDisplayName: fundPayerName.trim(),
                payerPhone: fundPayerPhone.trim(),
                fundingCountryCode: ccAirtel.length === 2 ? ccAirtel : "UG",
                note: fundNote.trim() || null,
              }),
            })
            const out = (await res.json().catch(() => ({}))) as { error?: string; request?: RetailerFundingRequest }
            if (!res.ok) {
              throw new Error(localizeFundingWithdrawalApiMessage(out.error || "Could not create pending funding", t))
            }
            setFundRequests((prev) => [out.request as RetailerFundingRequest, ...prev])
            showToast(t("funding.toast.adminAirtelQueued"), "success")
            setFundTxReference("")
            setFundNote("")
            setFundPayerName("")
            setFundPayerPhone("")
            setL1FundSource("crypto")
            setShowFundModal(null)
            setFundAmount("")
            return
          }

          if (l1FundSource !== "local") {
            throw new Error(t("funding.error.openLocalMobileFirst"))
          }
          if (localMmWizardStep !== 2) {
            throw new Error(t("funding.error.finishStep2"))
          }
          if (!(amount > 0)) throw new Error(t("funding.error.enterFundedAmount"))
          if ((!localMmSelectedDesk && !selectedOfficialRouteId) || !fundTxReference.trim()) {
            throw new Error(t("funding.error.pickDeskAndTxRef"))
          }
          if (!fundPayerName.trim() || !fundPayerPhone.trim()) {
            throw new Error(t("funding.error.senderIdentity"))
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
              ...(selectedOfficialRouteId
                ? { officialCorridorRouteId: selectedOfficialRouteId }
                : { retailerId: localMmSelectedDesk!.id }),
              amount,
              amountInputLocal: amountRaw,
              inputCurrency: localFundingFiat,
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
          if (!res.ok) throw new Error(localizeFundingWithdrawalApiMessage(out.error || "Could not create pending funding", t))
          setFundRequests((prev) => [out.request as RetailerFundingRequest, ...prev])
          showToast(
            selectedOfficialRouteId ? t("funding.toast.officialQueued") : t("funding.toast.retailerPending"),
            "success",
          )
          setQualifiedRetailers([])
          setOfficialCorridorFallback(null)
          setSelectedOfficialRouteId("")
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

        throw new Error(t("funding.error.unsupportedAction"))
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("funding.error.fundActionFailed"), "error")
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
    selectedOfficialRouteId,
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
    fundPaymentProofDataUrl,
    t,
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

  if (authLoading || !user || opsDeskBootstrapping) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        {opsDeskBootstrapping ? (
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            {roleHint?.tradingUserLevel === 5
              ? "Loading treasury and approval desk…"
              : "Loading operations desk…"}
          </p>
        ) : null}
      </div>
    )
  }

  const sidebarPanel =
    operationalWorkspace ? null : (
      <Sidebar coins={tradeCatalog.slice(0, 16)} />
    )

  return (
    <div className="nexus-mobile-stable min-h-screen overflow-x-hidden bg-background pb-20 md:pb-0">
      {/* Header */}
      <Header
        activeTab={activeTab}
        onTabChange={handleHeaderTabChange}
        coins={headerSearchCoins}
        currentUser={currentUser ?? undefined}
        referral={referralInfo}
        onLogout={handleLogout}
        retailerCreditDesk={retailerCreditDesk}
        operationalWorkspace={operationalWorkspace}
      />

      <LaunchStatusBanner />

      {showRetailBalancePanels && (
        <LiveMarketFeedBar
          status={marketFeed.status}
          updatedAt={marketFeed.updatedAt}
          errorMessage={marketFeed.error}
        />
      )}

      {showRetailBalancePanels ? (
        <div className="hidden md:block">
          <Ticker coins={tickerCoins} mobileStatic />
        </div>
      ) : null}

      {/* Operational / desk balance headers only (retail balances live on Container tab). */}
      {(level5Operational && activeTab === "desk") || (retailerOperationalHeader && activeTab === "desk") ? (
      <div className="mx-auto max-w-[1600px] px-4 pt-4">
        {level5Operational && activeTab === "desk" ? (
          <>
            <div className="mb-4 rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Company treasury (USD)</p>
                <button
                  type="button"
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Auto-approval float</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-primary">
                    {showBalance
                      ? treasuryPoolFormatted ||
                        (treasuryPoolUsd != null && Number.isFinite(treasuryPoolUsd)
                          ? new Intl.NumberFormat(locale || "en-US", {
                              style: "currency",
                              currency: "USD",
                            }).format(treasuryPoolUsd)
                          : "…")
                      : "••••••"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    MAIN_TREASURY · crypto credits, L5 approvals, retailer settlement debits.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Treasury reserve</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                    {showBalance
                      ? treasuryReserveFormatted ||
                        (treasuryReserveUsd != null && Number.isFinite(treasuryReserveUsd)
                          ? new Intl.NumberFormat(locale || "en-US", {
                              style: "currency",
                              currency: "USD",
                            }).format(treasuryReserveUsd)
                          : "…")
                      : "••••••"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    OPERATIONAL · bulk liquidity; transfer to float only when approvals need it.
                  </p>
                </div>
              </div>
            </div>
            <TreasuryPoolsPanel
              showBalance={showBalance}
              formatUsd={(n) =>
                new Intl.NumberFormat(locale || "en-US", { style: "currency", currency: "USD" }).format(n)
              }
            />
            <div className="mt-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-[10px] leading-snug text-muted-foreground">
              <p className="line-clamp-2">
                <span className="font-medium text-foreground">{t("deposit.timingLabel")}</span>{" "}
                {PROCESSING_COPY.deposits}
              </p>
            </div>
          </>
        ) : retailerOperationalHeader && activeTab === "desk" ? (
          <>
            <div className="mb-4 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Nexus Main Account</p>
                    <p className="mt-1 font-mono text-xl font-bold">
                      {showBalance ? formatUserMoney(mainBalance) : "••••"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Company-side corridor and transfers.</p>
                  </div>
                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Retailer Balance</p>
                    <p className="mt-1 font-mono text-xl font-bold text-primary">
                      {showBalance ? formatUserMoney(retailBalance) : "••••"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Regional float for customer funding approvals.</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowFundModal("add")
                      setFundAmount("")
                      setL1FundSource("crypto")
                      setQualifiedRetailers([])
                      setSelectedRetailerId("")
                      setFundTxReference("")
                      setFundNote("")
                      setFundMobileNetwork("")
                      setCryptoFundingMeta(null)
                      setFundPaymentProofDataUrl(null)
                      setFundPaymentProofPreview(null)
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-success/90 sm:flex-none"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t("funding.button.addFunds")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFundModal("withdraw")
                      setFundAmount("")
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80 sm:flex-none"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4l-8 8 8 8" />
                    </svg>
                    {t("funding.button.withdraw")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBalance(!showBalance)}
                    className="rounded-lg border border-border px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  >
                    {showBalance ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{t("deposit.timingLabel")}</span> {PROCESSING_COPY.deposits}
              </p>
              <p className="mt-1">
                <span className="font-medium text-foreground">{t("withdrawal.timingLabel")}</span> {PROCESSING_COPY.withdrawals}
              </p>
            </div>
          </>
        ) : null}
      </div>
      ) : null}

      {/* Add Fund / Withdraw Modal */}
      {showFundModal && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/75 pt-[max(0px,env(safe-area-inset-top,0px))] sm:items-center sm:justify-center sm:bg-black/65 sm:p-4 sm:pt-4 sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fund-modal-title"
        >
          <div className="flex min-h-0 max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md flex-1 flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[min(92dvh,720px)] sm:flex-none sm:rounded-2xl sm:p-5">
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 pb-2 pt-2 max-sm:pt-3 sm:px-0 sm:pb-3 sm:pt-0">
              <h2 id="fund-modal-title" className="text-lg font-bold sm:text-xl">
                {showFundModal === "add" ? t("funding.modal.titleAdd") : t("funding.modal.titleWithdraw")}
              </h2>
              <button
                type="button"
                onClick={() => setShowFundModal(null)}
                aria-label={t("funding.button.close")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 max-sm:h-11 max-sm:w-11 max-sm:bg-muted/90"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {showFundModal === "withdraw" ? null : retailerCreditDesk && retailerOpsBlocked ? (
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-muted-foreground">
                {t("funding.retailerOpsBlockedWithdraw")}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-pb-36 px-3 pb-4 [-webkit-overflow-scrolling:touch] max-sm:pb-[calc(13rem+env(safe-area-inset-bottom,0px))] sm:scroll-pb-8 sm:px-0 sm:pb-3">
            {showFundModal === "withdraw" ? null : customerRetailFunding && showFundModal === "add" ? (
              <div className="mb-3 space-y-2">
                <FundingPaymentPanel
                  activeSource={l1FundSource}
                  onSourceChange={(s) => {
                    setL1FundSource(s)
                    if (s === "local") {
                      setLocalMmWizardStep(1)
                      setQualifiedRetailers([])
                      setOfficialCorridorFallback(null)
                      setSelectedOfficialRouteId(null)
                      setSelectedRetailerId("")
                      setLocalMmRetailersSearched(false)
                    }
                  }}
                  userEmail={user?.email ?? currentUser?.email ?? ""}
                  fundAmount={fundAmount}
                  onFundAmountChange={setFundAmount}
                  fundTxReference={fundTxReference}
                  onTxReferenceChange={(v) => {
                    setFundTxReference(v)
                    setFundTxRefError(null)
                  }}
                  txReferenceError={fundTxRefError}
                  onTxReferenceBlur={validateFundTxReferenceOnBlur}
                  fundPayerName={fundPayerName}
                  onPayerNameChange={setFundPayerName}
                  fundPayerPhone={fundPayerPhone}
                  onPayerPhoneChange={setFundPayerPhone}
                  t={t}
                  minDepositLabel={t("funding.amount.minimumLine").replace(
                    "{{amount}}",
                    customerMinDepositDisplay,
                  )}
                />

                                {l1FundSource === "local" && localMmWizardStep === 1 ? (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">{t("funding.local.step1Title")}</p>
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {t("funding.local.badgeQualify")}
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">{t("funding.local.step1Body")}</p>
                    <div className="space-y-2.5">
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          {t("funding.field.country")}
                        </label>
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
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          {t("funding.field.network")}
                        </label>
                        <select
                          value={fundMobileNetwork}
                          onChange={(e) => setFundMobileNetwork(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                        >
                          <option value="">{t("funding.network.select")}</option>
                          <option value="MTN">MTN</option>
                          <option value="Airtel">Airtel</option>
                          <option value="MPesa">M-Pesa</option>
                          <option value="Orange">Orange</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          {t("funding.field.fundingAmount").replace("{{currency}}", fundingAmountLabelCurrency)}
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
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {t("funding.amount.minimumLine").replace(
                            "{{amount}}",
                            formatLocalFiatAmount(
                              minDepositLocalAmount(fundingAmountLabelCurrency),
                              fundingAmountLabelCurrency,
                              locale || "en-US",
                            ),
                          )}
                        </p>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          {t("funding.field.senderPhone")}
                        </label>
                        <input
                          type="tel"
                          value={fundPayerPhone}
                          onChange={(e) => setFundPayerPhone(e.target.value)}
                          placeholder={t("funding.placeholder.phoneExample")}
                          autoComplete="tel"
                          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          {t("funding.field.senderName")}
                        </label>
                        <input
                          type="text"
                          value={fundPayerName}
                          onChange={(e) => setFundPayerName(e.target.value)}
                          placeholder={t("funding.placeholder.fullName")}
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
                      {loadingQualifiedRetailers ? t("funding.findingRetailers") : t("funding.continueFindRetailers")}
                    </button>
                  </div>
                ) : null}

                {l1FundSource === "local" && localMmWizardStep === 2 ? (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-2 sm:space-y-3 sm:p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBackLocalMmWizard()}
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-semibold hover:bg-muted"
                      >
                        {t("funding.local.step2Back")}
                      </button>
                      <span className="text-[11px] font-semibold text-foreground">{t("funding.local.step2Title")}</span>
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

                    {!loadingQualifiedRetailers &&
                    localMmRetailersSearched &&
                    qualifiedRetailers.length === 0 &&
                    !officialCorridorFallback ? (
                      <div className="space-y-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-950 dark:text-amber-100">
                        <p className="font-medium">{t("funding.noDeskCorridorTitle")}</p>
                        <p>{t("funding.noDeskCorridorBody")}</p>
                      </div>
                    ) : null}

                    {qualifiedRetailers.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("funding.qualifiedDesksTitle")}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{t("funding.qualifiedDesksHint")}</p>
                        <div className="grid max-sm:grid-cols-1 max-sm:gap-2 sm:max-h-[min(50vh,320px)] sm:grid-cols-2 sm:gap-2 sm:overflow-y-auto">
                          {qualifiedRetailers.map((r) => {
                            const active = selectedRetailerId === r.id && !selectedOfficialRouteId
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
                                onClick={() => {
                                  setSelectedOfficialRouteId(null)
                                  setSelectedRetailerId(r.id)
                                }}
                                className={`rounded-lg border p-2.5 text-left text-[11px] transition-colors ${
                                  active ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border bg-background hover:bg-muted/50"
                                }`}
                              >
                                <p className="flex flex-wrap items-center gap-1 font-semibold text-foreground">
                                  {t("funding.deskPrefix")}
                                  {String(r.country_code ?? "").toUpperCase() || "—"}
                                  {r.qualification_verified_desk ? (
                                    <span className="rounded bg-emerald-500/20 px-1.5 py-0 text-[9px] font-bold uppercase text-emerald-800 dark:text-emerald-100">
                                      {t("funding.badge.verified")}
                                    </span>
                                  ) : null}
                                </p>
                                <p className="mt-1 font-mono text-[10px] text-muted-foreground line-clamp-3">
                                  {nums.length ? nums.join(" · ") : t("funding.paymentNumbersOnFile")}
                                </p>
                                {payee ? (
                                  <p className="mt-1 line-clamp-2 text-[10px] text-foreground/90">
                                    {t("funding.payeeLabel")} {payee}
                                  </p>
                                ) : null}
                                <p className="mt-1 text-[10px]">
                                  <span className="rounded bg-muted px-1 py-0.5 uppercase">{statusLabel}</span>
                                  {" · "}
                                  <span className="text-muted-foreground">
                                    {t("funding.availApprox").replace("{{amount}}", spend)}
                                  </span>
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

                    {qualifiedRetailers.length === 0 && officialCorridorFallback ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-100">
                          {t("funding.officialLineTitle")}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{t("funding.officialLineBody")}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRetailerId("")
                            setSelectedOfficialRouteId(officialCorridorFallback.id)
                          }}
                          className={`w-full rounded-xl border-2 p-3 text-left text-[11px] transition-colors ${
                            selectedOfficialRouteId === officialCorridorFallback.id
                              ? "border-sky-600 bg-sky-500/15 ring-2 ring-sky-500/30"
                              : "border-border bg-background hover:bg-muted/50"
                          }`}
                        >
                          <p className="font-bold text-foreground">{officialCorridorFallback.payee_display_name}</p>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            {(officialCorridorFallback.payment_numbers ?? [])
                              .map((p) => `${p.label ? `${p.label}: ` : ""}${p.value}`.trim())
                              .join(" · ") || t("funding.numbersConfigured")}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            WA {officialCorridorFallback.whatsapp_number || "—"} · {officialCorridorFallback.contact_phone || "—"}
                          </p>
                          {officialCorridorFallback.notice ? (
                            <p className="mt-2 text-[10px] leading-snug text-sky-950 dark:text-sky-50">{officialCorridorFallback.notice}</p>
                          ) : null}
                        </button>
                      </div>
                    ) : null}

                    {qualifiedRetailers.length > 0 || officialCorridorFallback ? (
                      <div className="max-w-full space-y-2 overflow-x-hidden border-t border-border/60 pt-2 sm:space-y-3 sm:pt-3">
                        {localMmSelectedDesk ? (
                          <>
                            <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-[11px] leading-snug sm:p-3 sm:text-xs">
                              <p className="font-semibold text-warning">{t("funding.payDeskOnlyTitle")}</p>
                              {localMmMtnMobile ? (
                                <>
                                  <p className="break-words">
                                    {t("funding.numbersLabel")}{" "}
                                    {t("funding.retailer.mtnDeskNumbersLine").replace(
                                      "{{msisdn}}",
                                      localMmMtnMobile.msisdn,
                                    )}
                                  </p>
                                  <p className="break-words">
                                    {t("funding.registeredPayeeNames")}{" "}
                                    {t("funding.retailer.mtnDeskPayeeLine")
                                      .replace("{{payee}}", localMmMtnMobile.payeeName)
                                      .replace("{{brand}}", localMmMtnMobile.payeeBrand)}
                                  </p>
                                  <p className="break-words font-mono text-[10px]">
                                    {t("funding.payment.mtnStep1").replace("{{ussd}}", localMmMtnMobile.ussdPrefix)}
                                  </p>
                                </>
                              ) : localMmAirtelMerchant ? (
                                <>
                                  <p className="break-words">
                                    {t("funding.numbersLabel")}{" "}
                                    {t("funding.retailer.airtelDeskNumbersLine").replace(
                                      "{{merchantId}}",
                                      localMmAirtelMerchant.merchantId,
                                    )}
                                  </p>
                                  <p className="break-words">
                                    {t("funding.registeredPayeeNames")} {t("funding.retailer.airtelDeskPayeeLine")}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="break-words">
                                    {t("funding.numbersLabel")}{" "}
                                    {(localMmSelectedDesk.payment_numbers ?? [])
                                      .map((p) => `${p.label ? `${p.label}: ` : ""}${p.value}`.trim())
                                      .join(" · ") || t("funding.noneInParens")}
                                  </p>
                                  <p className="break-words">
                                    {t("funding.registeredPayeeNames")}{" "}
                                    {localMmSelectedDesk.registered_payee_names || t("funding.confirmWithDesk")}
                                  </p>
                                </>
                              )}
                              <p className="break-words">
                                {t("funding.whatsappCall")} {localMmSelectedDesk.whatsapp_number || "—"} ·{" "}
                                {localMmSelectedDesk.contact_phone || "—"}
                              </p>
                              <p className="font-medium text-destructive break-words">{t("funding.wrongDestinationWarning")}</p>
                            </div>
                            <RetailerPaymentInstructionPanel
                              mtn={localMmMtnMobile}
                              airtel={
                                localMmAirtelMerchant
                                  ? {
                                      ussdPrefix: localMmAirtelMerchant.ussdPrefix,
                                      merchantId: localMmAirtelMerchant.merchantId,
                                    }
                                  : null
                              }
                              instructionPayeeRaw={localMmSelectedDesk.registered_payee_names}
                              payerEmail={currentUser?.email || t("funding.payment.yourLoginEmail")}
                              fundTxReference={fundTxReference}
                              onTxReferenceChange={(v) => {
                                setFundTxReference(v)
                                setFundTxRefError(null)
                              }}
                              onTxReferenceBlur={() => void validateFundTxReferenceOnBlur()}
                              txReferenceError={fundTxRefError}
                              txRefHint={
                                selectedOfficialRouteId ? t("funding.txRefHintOfficial") : t("funding.txRefHintRetailer")
                              }
                              fundNote={fundNote}
                              onFundNoteChange={setFundNote}
                              t={t}
                            />
                          </>
                        ) : localMmSelectedOfficial ? (
                          <div className="space-y-1 rounded-md border border-sky-600/40 bg-sky-500/10 p-3 text-[11px] sm:text-xs dark:text-sky-50">
                            <p className="font-semibold text-sky-900 dark:text-sky-100">{t("funding.officialReceiveTitle")}</p>
                            <p>
                              {t("funding.officialPayee")} <strong>{localMmSelectedOfficial.payee_display_name}</strong>
                            </p>
                            <p className="font-mono">
                              {(localMmSelectedOfficial.payment_numbers ?? [])
                                .map((p) => `${p.label ? `${p.label}: ` : ""}${p.value}`.trim())
                                .join(" · ")}
                            </p>
                            <p>
                              {t("funding.whatsappCall")} {localMmSelectedOfficial.whatsapp_number || "—"} ·{" "}
                              {localMmSelectedOfficial.contact_phone || "—"}
                            </p>
                            <p className="font-medium text-foreground">{t("funding.officialOpsNote")}</p>
                          </div>
                        ) : (
                          <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-950 dark:text-amber-50">
                            {t("funding.tapDeskOrOfficial")}
                          </div>
                        )}
                        {!localMmSelectedDesk ? (
                          <div className="max-w-full space-y-2 overflow-x-hidden rounded-lg border border-border/70 bg-background/80 p-2.5 sm:p-3">
                            <PaymentReferenceFields
                              fundTxReference={fundTxReference}
                              onTxReferenceChange={(v) => {
                                setFundTxReference(v)
                                setFundTxRefError(null)
                              }}
                              onTxReferenceBlur={() => void validateFundTxReferenceOnBlur()}
                              txReferenceError={fundTxRefError}
                              hint={
                                selectedOfficialRouteId ? t("funding.txRefHintOfficial") : t("funding.txRefHintRetailer")
                              }
                              t={t}
                            />
                            <div>
                              <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                                {t("funding.optionalMemo")}
                              </label>
                              <input
                                type="text"
                                value={fundNote}
                                onChange={(e) => setFundNote(e.target.value)}
                                placeholder={t("funding.memoPlaceholder")}
                                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {customerRetailFunding &&
                showFundModal === "add" &&
                !(l1FundSource === "local" && localMmWizardStep === 1) ? (
                  <details className="mt-2 rounded-lg border border-border/60 bg-muted/30 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="cursor-pointer select-none px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("funding.recentRequestsExpand")}
                    </summary>
                    <div className="max-h-32 space-y-1 overflow-y-auto border-t border-border/50 px-2 pb-2 pt-1 sm:max-h-36">
                      {fundRequests.slice(0, 6).map((r) => (
                        <div key={r.id} className="text-[11px]">
                          {r.tx_reference.slice(0, 18)} • {Number(r.amount).toFixed(2)} •{" "}
                          {r.status === "appealed" || r.status === "escalated"
                            ? t("funding.status.appealed")
                            : r.status}
                          {(r.status === "rejected" || r.status === "under_review" || r.status === "pending") && (
                            <button
                              type="button"
                              className="ml-2 text-primary underline"
                              onClick={async () => {
                                const appealNote = window.prompt(t("funding.appealPrompt"))
                                if (!appealNote?.trim()) return
                                const { data: s } = await supabase.auth.getSession()
                                const token = s.session?.access_token
                                if (!token) return
                                const res = await fetch("/api/user/retailer-funding", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ requestId: r.id, appealNote: appealNote.trim() }),
                                })
                                const out = (await res.json().catch(() => ({}))) as {
                                  error?: string
                                  threadId?: string
                                }
                                if (!res.ok) {
                                  showToast(out.error ?? t("funding.apiErr.appealFields"), "error")
                                  return
                                }
                                setFundRequests((prev) =>
                                  prev.map((x) =>
                                    x.id === r.id ? { ...x, status: "appealed", appeal_note: appealNote } : x
                                  )
                                )
                                if (out.threadId) {
                                  setSupportThreadFocusId(out.threadId)
                                }
                                showToast(t("funding.appealEscalated"), "success")
                              }}
                            >
                              {t("funding.appeal")}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
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
                            {row.profile_email ?? `Desk · ${row.user_id.slice(0, 8)}…`}
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
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("funding.incomingLocalTitle")}</p>
                  {retailerIncoming.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">{t("funding.noPendingApprovals")}</p>
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
                            {t("funding.approve")}
                          </button>
                          <button
                            type="button"
                            className="rounded bg-rose-700 px-2 py-0.5 text-white"
                            onClick={() => void handleRetailerIncomingAction(r.id, "reject")}
                          >
                            {t("funding.reject")}
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
              <div className="shrink-0 border-t border-border/70 bg-card px-4 py-2.5 text-center max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[110] max-sm:mx-auto max-sm:max-w-md max-sm:w-full max-sm:border-border max-sm:px-3 max-sm:py-2 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px),16px)] max-sm:shadow-[0_-8px_28px_rgba(0,0,0,0.28)] sm:relative sm:px-0">
                <p className="text-[10px] text-muted-foreground">
                  {t("funding.footerNextLead")}{" "}
                  <span className="font-semibold text-foreground">{t("funding.continueFindRetailers")}</span>{" "}
                  {t("funding.footerNextTail")}
                </p>
              </div>
            ) : (
            <div className="shrink-0 space-y-2 border-t border-border/80 bg-card px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-2 shadow-[0_-6px_24px_rgba(0,0,0,0.16)] max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[110] max-sm:mx-auto max-sm:max-w-md max-sm:w-full max-sm:rounded-t-xl max-sm:border-border max-sm:bg-card max-sm:px-3 max-sm:pb-[max(1rem,env(safe-area-inset-bottom,0px))] max-sm:pt-2.5 max-sm:shadow-[0_-10px_32px_rgba(0,0,0,0.32)] sm:relative sm:z-20 sm:rounded-none sm:px-0 sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pt-3">
            {(showFundModal === "withdraw" ||
              retailerCreditDesk ||
              (customerRetailFunding && (l1FundSource === "airtel" || l1FundSource === "pick"))) && (
              <div className="mb-0">
                <label className="mb-1 block text-xs font-medium text-muted-foreground sm:text-sm">
                  {showFundModal === "withdraw"
                    ? t("withdrawal.amountLabel").replace("{{currency}}", currency)
                    : retailerCreditDesk
                      ? t("funding.amount.retailerTopup").replace("{{currency}}", currency)
                      : t("funding.amount.matchSend").replace(
                          "{{currency}}",
                          l1FundSource === "airtel" ? fundingAmountLabelCurrency : currency,
                        )}
                </label>
                <input
                  type="number"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder={`0 (${currency})`}
                  className="w-full rounded-lg border border-border bg-background py-2 px-3 font-mono text-base outline-none transition-colors focus:border-primary sm:py-2.5 sm:text-lg"
                />
                {showFundModal !== "withdraw" && (
                  <>
                    <p className="mt-1 text-[10px] text-muted-foreground sm:text-[11px]">
                      {t("funding.amount.hintMatchSend")}
                    </p>
                    <p className="mt-0.5 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
                      {t("funding.amount.minimumLine").replace("{{amount}}", customerMinDepositDisplay)}
                    </p>
                  </>
                )}
                {showFundModal === "withdraw" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("withdrawal.availableLabel")}{" "}
                    {showBalance ? formatUserMoney(mainBalance) : "••••"}
                  </p>
                )}
                {showFundModal === "withdraw" && withdrawalEligibility ? (
                  <div className="mt-2 rounded-lg border border-border/80 bg-muted/30 p-2 text-[11px] leading-snug text-muted-foreground">
                    <p>
                      {t("withdrawal.modal.ruleOnce")}
                      {withdrawalEligibility.cooldownActive
                        ? ` ${t("withdrawal.modal.waitHours").replace(
                            "{{hours}}",
                            String(Math.max(1, Math.ceil(withdrawalEligibility.msRemaining / 3_600_000))),
                          )}`
                        : ` ${t("withdrawal.modal.readyNow")}`}
                    </p>
                    <p className="mt-1">
                      {t("withdrawal.modal.minLine").replace(
                        "{{min}}",
                        formatLocalFiatAmount(
                          minDepositLocalAmount(currency),
                          currency,
                          locale || "en-US",
                        ),
                      )}
                    </p>
                    <p className="mt-0.5">
                      {t("withdrawal.modal.maxLine").replace(
                        "{{max}}",
                        formatUserMoney(withdrawalEligibility.maxUsd),
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex flex-col gap-1.5 sm:gap-2">
              {showFundModal === "add" &&
              customerRetailFunding &&
              l1FundSource === "local" &&
              localMmWizardStep === 2 ? (
                <p className="text-[10px] text-muted-foreground">
                  {!localMmSelectedDesk && !selectedOfficialRouteId
                    ? t("withdrawal.status.selectDesk")
                    : !fundTxReference.trim()
                      ? t("withdrawal.status.enterTxRef")
                      : !fundPayerName.trim() || !fundPayerPhone.trim()
                        ? t("withdrawal.status.senderRequired")
                        : !fundMobileNetwork.trim() || fundingCountryCodeInput.trim().length !== 2
                          ? t("withdrawal.status.countryNetwork")
                          : !(parseFloat(fundAmount) > 0)
                            ? t("withdrawal.status.amountMissing")
                            : t("withdrawal.status.readyConfirm")}
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleFundSubmit}
                disabled={
                  isFundProcessing ||
                  (showFundModal === "withdraw" && (!fundAmount || parseFloat(fundAmount) <= 0)) ||
                  (showFundModal === "add" &&
                    customerRetailFunding &&
                    (l1FundSource === "pick" ||
                      (l1FundSource === "crypto" &&
                        (!fundTxReference.trim() ||
                          Boolean(fundTxRefError) ||
                          !(parseFloat(fundAmount) > 0))) ||
                      (l1FundSource === "airtel" &&
                        (!fundTxReference.trim() ||
                          Boolean(fundTxRefError) ||
                          !fundPayerName.trim() ||
                          !fundPayerPhone.trim() ||
                          !(parseFloat(fundAmount) > 0))))) ||
                  (showFundModal === "add" && retailerCreditDesk) ||
                  (showFundModal === "add" && (currentUser?.level ?? 1) === 5) ||
                  (showFundModal === "add" &&
                    customerRetailFunding &&
                    l1FundSource === "local" &&
                    (localMmWizardStep !== 2 ||
                      (!localMmSelectedDesk && !selectedOfficialRouteId) ||
                      !fundTxReference.trim() ||
                      Boolean(fundTxRefError) ||
                      !fundPayerName.trim() ||
                      !fundPayerPhone.trim() ||
                      !fundMobileNetwork.trim() ||
                      fundingCountryCodeInput.trim().length !== 2 ||
                      !(parseFloat(fundAmount) > 0)))
                }
                className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg py-3 text-base font-semibold text-white transition-colors disabled:opacity-50 ${
                  showFundModal === "add" ? "bg-success hover:bg-success/90" : "bg-primary hover:bg-primary/90"
                }`}
              >
                {isFundProcessing ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t("funding.cta.processing")}
                  </>
                ) : showFundModal === "withdraw" ? (
                  fundAmount.trim()
                    ? t("withdrawal.cta.withdrawWithAmount").replace(
                        "{{amount}}",
                        formatLocalFiatAmount(parseFloat(fundAmount) || 0, currency, locale),
                      )
                    : t("withdrawal.cta.withdraw")
                ) : customerRetailFunding && l1FundSource === "local" ? (
                  t("funding.cta.confirmPayment")
                ) : customerRetailFunding && l1FundSource === "crypto" ? (
                  t("funding.cta.submitCryptoDeposit")
                ) : customerRetailFunding && l1FundSource === "airtel" ? (
                  t("funding.cta.submitAdminPayment")
                ) : customerRetailFunding ? (
                  t("funding.cta.chooseLocalPath")
                ) : (
                  t("funding.cta.addFunds")
                )}
              </button>
            </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content — Container desk + Wallstreet assistant only (no legacy live/markets decks). */}
      <div className={`mx-auto max-w-[1600px] px-4 pb-24 md:pb-4 ${activeTab === "container" ? "" : "pt-3"}`}>
        {activeTab === "container" && (
          <div className="space-y-4">
            {showRetailBalancePanels ? (
              <RetailBalanceHomePanels
                t={t}
                formatUserMoney={formatUserMoney}
                showBalance={showBalance}
                onToggleShowBalance={() => setShowBalance((v) => !v)}
                fullName={currentUser?.fullName}
                mainBalance={mainBalance}
                totalEarnings={totalEarnings}
                containerWithdrawableEarnings={containerWithdrawableEarnings}
                withdrawalPendingBalance={withdrawalPendingBalance}
                activeContainerEarnings={activeContainerEarnings}
                containerFeesPaid={containerFeesPaid}
                connectedExchangeTotalUsd={connectedExchanges.reduce(
                  (sum, ex) => sum + Number(ex.balance ?? 0),
                  0,
                )}
                connectedExchangeCount={connectedExchanges.length}
                isContainerFlowBusy={isContainerFlowBusy}
                withdrawalEligibility={withdrawalEligibility}
                onAddFunds={() => {
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
                onWithdraw={() => {
                  setShowFundModal("withdraw")
                  setFundAmount("")
                }}
                onTransferToMain={() => void runContainerFlowAction("transfer_to_main")}
                onExtract={() => void runContainerFlowAction("extract")}
                onManageExchanges={() => {
                  setSettingsRequestedView("exchanges")
                  setActiveTab("settings")
                }}
              />
            ) : null}
            {!operationalWorkspace ? (
              <DashboardTestimonialStrip
                visible={testimonialNotif.visible}
                text={testimonialNotif.text}
                onDismiss={testimonialNotif.dismiss}
                inFlowOnMobile
              />
            ) : null}
            <ContainerDeskSection
              sidebar={sidebarPanel}
              expandLabel={t("home.trading.expand")}
              collapseLabel={t("home.trading.collapse")}
            >
              <ContainerMode
                userLevel={(currentUser?.level ?? 1) as 1 | 2 | 3 | 4 | 5}
                retailerCreditSeller={Boolean(op.snapshot?.profile?.retailerCreditSeller)}
                retailerLiquidityOpsBlocked={retailerOpsBlocked}
                containerLiquidEarningsUsd={containerWithdrawableEarnings}
              />
            </ContainerDeskSection>
          </div>
        )}

        {activeTab === "wallstreet" && (
          <main className="relative min-w-0">
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
        )}

        {activeTab === "desk" && operationalWorkspace ? (
          <div className="flex flex-col gap-4 lg:flex-row">
            {sidebarPanel ? (
              <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebarPanel}</div>
            ) : null}
            <main className="min-w-0 flex-1">
              <WalletScreen
                coins={tradeCatalog.slice(0, 24)}
                tradingUserLevel={currentUser?.level ?? 1}
                retailerCreditDesk={retailerCreditDesk}
                isGuestSession={isGuestSession}
                operationalMode={operationalWorkspace}
                focusSupportThreadId={supportThreadFocusId}
                onFocusSupportThreadConsumed={() => setSupportThreadFocusId(null)}
              />
            </main>
          </div>
        ) : null}

        {!operationalWorkspace && activeTab === "notifications" ? (
          <NotificationCenterScreen />
        ) : null}

        {activeTab === "settings" && (
          <SettingsScreen
                onLogout={handleLogout}
                requestedView={settingsRequestedView}
                onRequestViewConsumed={handleSettingsRequestConsumed}
                isGuestSession={isGuestSession}
                tradingUserLevel={currentUser?.level ?? 1}
                retailerCreditDesk={retailerCreditDesk}
              />
        )}
      </div>

      {!isGuestSession && (currentUser?.level ?? 1) === 5 && (
        <div className="mx-auto max-w-[1600px] px-4 pb-1">
          <OperationalContinuityHud />
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleHeaderTabChange}
        isGuestSession={isGuestSession}
        operationalWorkspace={operationalWorkspace}
      />

      {/* Toast */}
      <ToastNotification
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

    </div>
  )
}
