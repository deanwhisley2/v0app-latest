"use client"

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { useOperationalBootstrap } from "@/contexts/OperationalBootstrapContext"
import { supabase } from "@/lib/supabaseClient"
import { Header } from "@/components/dashboard/header"
import { MobileAppBar } from "@/components/dashboard/mobile-app-bar"
import { Ticker } from "@/components/dashboard/ticker"
import { Sidebar } from "@/components/dashboard/sidebar"
import { BottomNav } from "@/components/dashboard/bottom-nav"
import { ToastNotification, useToast } from "@/components/dashboard/toast-notification"
import { LiveMarketFeedBar } from "@/components/dashboard/live-market-feed-bar"
import { useMarketPriceAuthority } from "@/hooks/use-market-price-authority"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import type { SettingsView } from "@/components/dashboard/settings-screen"
import { RetailBalanceHomePanels } from "@/components/dashboard/retail-balance-home-panels"

const NexusBotWorkspace = dynamic(
  () => import("@/components/dashboard/nexus-bot-workspace").then((m) => m.NexusBotWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading Nexus Bot">
        <div className="h-12 rounded-xl bg-muted/40 max-md:animate-none" />
        <div className="h-32 rounded-xl bg-muted/30 max-md:animate-none" />
      </div>
    ),
  },
)

const WalletScreen = dynamic(
  () => import("@/components/dashboard/wallet-screen").then((m) => m.WalletScreen),
  { ssr: false, loading: () => <PanelLoader label="Loading wallet…" /> },
)

const SettingsScreen = dynamic(
  () => import("@/components/dashboard/settings-screen").then((m) => m.SettingsScreen),
  { ssr: false, loading: () => <PanelLoader label="Loading settings…" /> },
)

const ChatHubScreen = dynamic(
  () => import("@/components/dashboard/chat-hub-screen").then((m) => m.ChatHubScreen),
  { ssr: false, loading: () => <PanelLoader label="Loading chat…" /> },
)

function PanelLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-border bg-card p-6">
      <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  )
}
import { ContainerDeskSection } from "@/components/dashboard/container-desk-section"
import { coinsData } from "@/lib/coins-data"
import type { DashboardTradeView } from "@/lib/dashboard-trade-view"
import type { Coin } from "@/lib/coins-data"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { useDashboardTestimonialNotifs } from "@/hooks/use-dashboard-testimonial-notifs"
import { DashboardTestimonialStrip } from "@/components/dashboard/dashboard-testimonial-strip"
import { DeferredMount } from "@/components/mobile/deferred-mount"
import { DashboardPanelErrorBoundary } from "@/components/dashboard/dashboard-panel-error-boundary"
import { getChatChunkMountDelayMs } from "@/lib/mobile/chat-mount-policy"
import type { NexusNotificationNav } from "@/lib/nexus-notification-nav"
import {
  buildActivitySnapshot,
  clearDashboardActivity,
  hydrateWorkspaceFromRemote,
  resolveCoinForSession,
  writeDashboardActivity,
} from "@/lib/dashboard-activity-session"
import { broadcastOperationalBump } from "@/lib/nexus-operational-sync-broadcast"
import { OperationalContinuityHud } from "@/components/dashboard/operational-continuity-hud"
import { LaunchStatusBanner } from "@/components/dashboard/launch-status-banner"
import { NexusPushAlertsBootstrap } from "@/components/push/nexus-push-alerts-bootstrap"
import { TradeCelebrationBootstrap } from "@/components/dashboard/trade-celebration-bootstrap"
import { NewMemberCampaignPromoModal } from "@/components/marketing/new-member-campaign-promo-modal"
import { StartupBonusOnboardingOrchestrator } from "@/components/marketing/startup-bonus-onboarding-orchestrator"
import { StartupBonusCampaignPanelSection } from "@/components/marketing/startup-bonus-campaign-panel-section"
import { revealMobileHeader } from "@/lib/mobile/mobile-chrome-events"
import { DashboardWorkspaceRefresh } from "@/components/dashboard/dashboard-workspace-refresh"
import { useDashboardNavigationController } from "@/hooks/use-dashboard-navigation-controller"
import { reportClientDiagnostic } from "@/lib/mobile/mobile-navigation-diagnostics"
import type { DashboardMainTab } from "@/lib/dashboard-navigation-policy"
import { hasRecentFreshLogin, postLoginTab } from "@/lib/dashboard-navigation-policy"
import { isValidTradeCodeFormat, normalizeTradeCode } from "@/lib/nexus-bot/trade-code"
import {
  DASHBOARD_CLEAN_BOOT_RESET_EVENT,
  purgeDashboardUnsafeSessionState,
  shouldSkipDashboardTabRestore,
} from "@/lib/mobile/dashboard-clean-boot"
import {
  CHROME_BFCACHE_RESET_EVENT,
  purgeChromeUnsafeSessionState,
} from "@/lib/mobile/chrome-android-safe-mode"
import { HistoryCenterScreen } from "@/components/dashboard/history-center-screen"
import { EmailVerificationReminderBanner } from "@/components/dashboard/email-verification-reminder-banner"
import { OptionalSecurityReminderBanner } from "@/components/dashboard/optional-security-reminder-banner"
import { SecuritySetupGateDialog } from "@/components/dashboard/security-setup-gate-dialog"
import { fetchSecurityProfileForAction } from "@/lib/nexus-security-profile-client"
import { loadWithdrawReadiness } from "@/lib/client/withdraw-readiness"
import {
  defaultWithdrawPayoutOptionId,
  withdrawPayoutOptionsFromProfile,
} from "@/lib/client/withdraw-payout-options"
import type { PublicSecurityProfile, RegisteredPayoutOption } from "@/lib/nexus-security-profile-types"
import { PROCESSING_COPY } from "@/lib/nexus-financial-policy"
import {
  corridorFiatForCountryIso2,
  formatLocalFiatAmount,
  formatMinDepositForCustomer,
  localFiatUnitsToUsd,
  minDepositLocalAmount,
  parseCustomerLocalAmountInput,
  usdFromCustomerLocalInput,
} from "@/lib/currency-display"
import { localizeFundingWithdrawalApiMessage } from "@/lib/i18n/localize-funding-withdrawal-api-message"
import { refreshLiveBalanceBeforeAction } from "@/lib/client/refresh-live-balance"
import { dispatchCustomerLedgerBump, NEXUS_CUSTOMER_LEDGER_BUMP } from "@/lib/client/customer-ledger-sync"
import { useOperationalRealtime } from "@/hooks/use-operational-realtime"
import { formatAmountInputLive } from "@/lib/customer-amount-input-format"
import { SmartAmountInput } from "@/components/ui/smart-amount-input"
import { FundingPaymentPanel, type L1FundSource } from "@/components/dashboard/funding-payment-panel"
import {
  NexusPaymentGatewayCard,
  fundSourceFromGatewayMethod,
  type NexusGatewayStep,
  type PaymentVerificationStatus,
} from "@/components/dashboard/NexusPaymentGatewayCard"
import {
  addFundsPayerIsReady,
  bindFundPayerFromOption,
  bindFundPayerFromProfile,
  listFundPayerOptionsForNetwork,
  type FundPayerSource,
} from "@/lib/client/fund-payer-from-profile"
import { RegisteredPayerPicker } from "@/components/dashboard/registered-payer-picker"
import { NetworkPaymentCardHeader } from "@/components/dashboard/network-payment-card-header"
import {
  deskPayeeDisplayForNetwork,
  deskPaymentRouteForNetwork,
  filterDeskPaymentLinesForNetwork,
  formatDeskPaymentLinesSummary,
} from "@/lib/retailer-desk-network-display"
import { PaymentNetworkLogo } from "@/components/brand/payment-network-logo"
import {
  isKenyaAdminMpesaEligible,
  isUgandaAdminAirtelEligible,
  mobileNetworksForFundingCountry,
} from "@/lib/operating-countries"
import {
  PaymentReferenceFields,
  RetailerPaymentInstructionPanel,
} from "@/components/dashboard/mobile-money-payment-instructions"
import { TreasuryPoolsPanel } from "@/components/dashboard/treasury-pools-panel"
import { getOperationalRoleHint } from "@/lib/operational-role-hint"
import {
  parseKeMpesaMobileDesk,
  parseUgAirtelMerchantDesk,
  parseUgMtnMobileDesk,
} from "@/lib/retailer-payment-templates"
import { formatFundingReceiptCompact } from "@/lib/formatting/funding-amount-display"

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
  payment_rotation_line_id?: string
  payment_rotation_pool_id?: string
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
  amount_usd_locked?: number | null
  amount_input_local?: number | null
  input_currency?: string | null
  fx_rate_snapshot?: number | null
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
  amount_usd_locked?: number | null
  amount_input_local?: number | null
  input_currency?: string | null
  fx_rate_snapshot?: number | null
  l5_settlement_usd?: number | null
  fx_middleware?: Record<string, unknown> | null
  tx_reference: string
  status: string
  mobile_network?: string | null
  created_at: string
}

function fundRequestReceiptLabel(r: {
  amount: number
  amount_usd_locked?: number | null
  amount_input_local?: number | null
  input_currency?: string | null
  fx_rate_snapshot?: number | null
  fx_middleware?: Record<string, unknown> | null
}): string {
  return formatFundingReceiptCompact({
    amount: r.amount,
    amount_usd_locked: r.amount_usd_locked ?? null,
    amount_input_local: r.amount_input_local ?? null,
    input_currency: r.input_currency ?? null,
    fx_rate_snapshot: r.fx_rate_snapshot ?? null,
    fx_middleware: r.fx_middleware ?? null,
  })
}

const initialMarketFeed: MarketFeedState = {
  status: "loading",
  gainers: [],
  volumeLeaders: [],
  catalog: [],
}

const INACTIVE_LIVE_ANALYSIS = {
  active: false,
  coin: null as Coin | null,
  strategies: [] as string[],
  expertMode: false,
  autoTrade: false,
  tradeAmount: 100,
}

function normalizeSymbol(value: string): string {
  const upper = value.toUpperCase().trim()
  return upper.endsWith("USDT") ? upper.slice(0, -4) : upper
}

export function DashboardPageInner({ fundPageOnly = null }: { fundPageOnly?: "add" | "withdraw" | null } = {}) {
  const router = useRouter()
  const { registerAppNavigator } = useNexusNotifications()
  const { user, isLoading: authLoading, authReady, signOut, isGuestSession } = useAuth()
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
    !op.error &&
    Boolean(roleHint?.isOperationalDesk)

  const activityUserId = user?.id ?? "guest"
  const { formatUserMoney, currency, locale, t } = useUserPreferences()
  const testimonialNotif = useDashboardTestimonialNotifs({
    enabled: Boolean(user) && !isGuestSession,
    userId: user?.id,
    formatUserMoney,
  })
  const navCtrl = useDashboardNavigationController(operationalWorkspace)
  const activeTabRef = useRef("container")
  const uiHistoryPopRef = useRef(false)
  const uiHistoryReadyRef = useRef(false)
  const prevFundModalRef = useRef<"add" | "withdraw" | null>(null)
  const prevSettingsViewRef = useRef<SettingsView | null>(null)
  const [activeTab, setActiveTab] = useState<DashboardMainTab | string>("container")
  const [startupActivateRequest, setStartupActivateRequest] = useState(0)
  const [settingsRequestedView, setSettingsRequestedView] = useState<SettingsView | null>(null)
  const [showFundModal, setShowFundModal] = useState<"add" | "withdraw" | null>(null)
  const [gatewayStep, setGatewayStep] = useState<NexusGatewayStep>(1)
  const [paymentVerificationStatus, setPaymentVerificationStatus] =
    useState<PaymentVerificationStatus>("idle")
  const [withdrawPendingAckOpen, setWithdrawPendingAckOpen] = useState(false)
  const [withdrawPendingAckAmount, setWithdrawPendingAckAmount] = useState<string | null>(null)

  const setTabProgrammatic = useCallback(
    (tab: string, source: string) => {
      const next = navCtrl.normalizeTab(tab)
      if (next === activeTabRef.current) return
      reportClientDiagnostic({
        kind: "tab_change",
        message: source,
        meta: { from: activeTabRef.current, to: next, userInitiated: false },
      })
      setActiveTab(next)
    },
    [navCtrl],
  )

  const setTabUser = useCallback(
    (tab: string, source: string) => {
      navCtrl.markUserNav()
      const next = navCtrl.normalizeTab(tab)
      reportClientDiagnostic({
        kind: "tab_change",
        message: source,
        meta: { from: activeTabRef.current, to: next, userInitiated: true },
      })
      if (typeof window !== "undefined" && !uiHistoryPopRef.current && uiHistoryReadyRef.current) {
        window.history.pushState({ nexusDashboardUi: true, tab: next }, "")
      }
      setActiveTab(next)
    },
    [navCtrl],
  )

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    if (typeof window === "undefined" || !uiHistoryReadyRef.current || uiHistoryPopRef.current) {
      prevFundModalRef.current = showFundModal
      prevSettingsViewRef.current = settingsRequestedView
      return
    }
    const openedFundModal = !prevFundModalRef.current && Boolean(showFundModal)
    const openedSettingsSubView = !prevSettingsViewRef.current && Boolean(settingsRequestedView)
    if (openedFundModal || openedSettingsSubView) {
      window.history.pushState(
        {
          nexusDashboardUi: true,
          tab: navCtrl.normalizeTab(activeTabRef.current),
          modal: showFundModal,
          settingsView: settingsRequestedView,
        },
        "",
      )
    }
    prevFundModalRef.current = showFundModal
    prevSettingsViewRef.current = settingsRequestedView
  }, [showFundModal, settingsRequestedView, navCtrl])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!uiHistoryReadyRef.current) {
      window.history.replaceState(
        {
          nexusDashboardUi: true,
          tab: navCtrl.normalizeTab(activeTabRef.current),
          modal: showFundModal,
          settingsView: settingsRequestedView,
        },
        "",
      )
      uiHistoryReadyRef.current = true
      return
    }
    if (uiHistoryPopRef.current) {
      uiHistoryPopRef.current = false
      return
    }
    window.history.replaceState(
      {
        nexusDashboardUi: true,
        tab: navCtrl.normalizeTab(activeTabRef.current),
        modal: showFundModal,
        settingsView: settingsRequestedView,
      },
      "",
    )
  }, [activeTab, showFundModal, settingsRequestedView, navCtrl])

  useEffect(() => {
    if (typeof window === "undefined") return
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as
        | { nexusDashboardUi?: boolean; tab?: string; modal?: "add" | "withdraw" | null; settingsView?: SettingsView | null }
        | null
      if (!state?.nexusDashboardUi) return
      uiHistoryPopRef.current = true
      setTabProgrammatic(state.tab ?? postLoginTab(operationalWorkspace), "popstate_ui")
      setShowFundModal(state.modal ?? null)
      setSettingsRequestedView(state.settingsView ?? null)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [operationalWorkspace, setTabProgrammatic])

  const [containerActiveTradeCount, setContainerActiveTradeCount] = useState(0)
  const [containerDeskOpenNonce, setContainerDeskOpenNonce] = useState(0)
  const [tradeCodePrefill, setTradeCodePrefill] = useState<string | null>(null)
  const handleContainerSessionCounts = useCallback((counts: { copy: number; fix: number }) => {
    setContainerActiveTradeCount(counts.copy + counts.fix)
  }, [])

  useEffect(() => {
    if (authLoading || !user || isGuestSession || activeTab !== "container" || operationalWorkspace) return
    let cancelled = false
    const loadSessions = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token || cancelled) return
        const res = await fetch("/api/user/trade-sessions/active", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const out = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          copySessions?: unknown[]
          fixedSessions?: unknown[]
        }
        if (cancelled || !res.ok || !out.ok) return
        setContainerActiveTradeCount(
          (out.copySessions?.length ?? 0) + (out.fixedSessions?.length ?? 0),
        )
      } catch {
        /* ignore */
      }
    }
    void loadSessions()
    return () => {
      cancelled = true
    }
  }, [authLoading, user, isGuestSession, activeTab, operationalWorkspace])
  useEffect(() => {
    if (activeTab !== "wallet") return
    setTabProgrammatic(operationalWorkspace ? "desk" : "history", "legacy_wallet_tab")
  }, [activeTab, operationalWorkspace, setTabProgrammatic])

  useEffect(() => {
    if (activeTab !== "desk" || operationalWorkspace) return
    setTabProgrammatic("container", "legacy_desk_tab_trader")
  }, [activeTab, operationalWorkspace, setTabProgrammatic])

  const tradeView: DashboardTradeView = "overview"
  /** Deep-link / notification → operational support thread (wallet Assets). */
  const [supportThreadFocusId, setSupportThreadFocusId] = useState<string | null>(null)
  const supportThreadFromUrlRef = useRef<string | null>(null)
  const supportThreadUrlParsedRef = useRef(false)
  const [chatHubFocus, setChatHubFocus] = useState<"ai" | "support" | null>(null)
  const [securityGateOpen, setSecurityGateOpen] = useState(false)
  const [securityGateDetail, setSecurityGateDetail] = useState<string | null>(null)
  const [fundModalError, setFundModalError] = useState<string | null>(null)
  const [withdrawPayoutProfile, setWithdrawPayoutProfile] = useState<PublicSecurityProfile | null>(null)
  const [selectedWithdrawPayoutId, setSelectedWithdrawPayoutId] = useState<string | null>(null)
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState("BTC")
  const [showBalance, setShowBalance] = useState(true)
  const [mainBalance, setMainBalance] = useState(0)
  const [containerLockedUsd, setContainerLockedUsd] = useState(0)
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
  const [fundPayerSource, setFundPayerSource] = useState<FundPayerSource>("manual")
  const [fundPayerProfile, setFundPayerProfile] = useState<PublicSecurityProfile | null>(null)

  const applyRegisteredFundPayer = useCallback(
    (profile: PublicSecurityProfile | null, fundingNetwork?: string | null, preferredSource?: FundPayerSource) => {
      const binding = bindFundPayerFromProfile(profile, fundingNetwork, preferredSource)
      if (binding.hasRegisteredLine) {
        setFundPayerSource(binding.source)
        setFundPayerName(binding.displayName)
        setFundPayerPhone(binding.displayPhone)
      } else {
        setFundPayerSource("manual")
        setFundPayerName("")
        setFundPayerPhone("")
      }
    },
    [],
  )
  const [selectedRetailerId, setSelectedRetailerId] = useState("")
  const [retailerRows, setRetailerRows] = useState<RetailerRow[]>([])
  const [fundRequests, setFundRequests] = useState<RetailerFundingRequest[]>([])
  const [retailerPaymentNumbersInput, setRetailerPaymentNumbersInput] = useState("")
  const [l1FundSource, setL1FundSource] = useState<L1FundSource>("crypto")
  const [fundPaymentProofDataUrl, setFundPaymentProofDataUrl] = useState<string | null>(null)
  const [fundPaymentProofPreview, setFundPaymentProofPreview] = useState<string | null>(null)
  const [fundingCountryCodeInput, setFundingCountryCodeInput] = useState("")
  const [fundMobileNetwork, setFundMobileNetwork] = useState("")
  const fundingPayerNetwork = useMemo(() => {
    if (l1FundSource === "airtel") return "Airtel"
    if (l1FundSource === "mpesa_ke") return "MPesa"
    if (l1FundSource === "local" && fundMobileNetwork.trim()) return fundMobileNetwork.trim()
    return null
  }, [l1FundSource, fundMobileNetwork])
  const fundPayerOptions = useMemo(
    () => listFundPayerOptionsForNetwork(fundPayerProfile, fundingPayerNetwork),
    [fundPayerProfile, fundingPayerNetwork],
  )
  const showFundRegisteredPayerPicker = useMemo(() => {
    if (showFundModal !== "add" || fundPayerOptions.length === 0) return false
    if (l1FundSource === "pick" || l1FundSource === "crypto") return false
    if (l1FundSource === "local") return Boolean(fundMobileNetwork.trim())
    return l1FundSource === "airtel" || l1FundSource === "mpesa_ke"
  }, [showFundModal, fundPayerOptions.length, l1FundSource, fundMobileNetwork])
  const selectFundPayerOption = useCallback((opt: RegisteredPayoutOption) => {
    const binding = bindFundPayerFromOption(opt)
    setFundPayerSource(binding.source)
    setFundPayerName(binding.displayName)
    setFundPayerPhone(binding.displayPhone)
  }, [])
  const fundPayerBinding = useMemo(
    () => bindFundPayerFromProfile(fundPayerProfile, fundingPayerNetwork, fundPayerSource),
    [fundPayerProfile, fundingPayerNetwork, fundPayerSource],
  )
  useEffect(() => {
    if (!showFundRegisteredPayerPicker || fundPayerOptions.length !== 1) return
    const only = fundPayerOptions[0]
    if (fundPayerSource !== only.id) selectFundPayerOption(only)
  }, [showFundRegisteredPayerPicker, fundPayerOptions, fundPayerSource, selectFundPayerOption])
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
  
  const activityHydratedRef = useRef(false)
  const bootTabLockedRef = useRef(false)
  const activityLastSerializedRef = useRef<string>("")
  const persistWorkspaceTimerRef = useRef<number | null>(null)
  const lastServerWorkspaceAppliedRef = useRef<string>("")
  const lastWorkspacePostedRef = useRef<string>("")
  const [chatChunkReady, setChatChunkReady] = useState(false)

  /** One-shot boot — never re-read session/Postgres tab on user id change (Chrome hydration killer). */
  useLayoutEffect(() => {
    if (typeof window === "undefined" || bootTabLockedRef.current) return
    bootTabLockedRef.current = true
    purgeDashboardUnsafeSessionState()
    purgeChromeUnsafeSessionState()
    const tab = postLoginTab(operationalWorkspace)
    setActiveTab(tab)
    activeTabRef.current = tab
    activityHydratedRef.current = true
    navCtrl.markHydrated()
    activityLastSerializedRef.current = JSON.stringify(
      buildActivitySnapshot(activityUserId, {
        activeTab: tab,
        tradeView: "overview",
        selectedCoinSymbol: "BTC",
        showBalance: true,
        liveAnalysis: INACTIVE_LIVE_ANALYSIS,
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional single mount boot
  }, [])

  useEffect(() => {
    if (activeTab !== "chat") {
      setChatChunkReady(false)
      setChatHubFocus(null)
      setSupportThreadFocusId(null)
      return
    }
    const t0 = window.setTimeout(() => setChatChunkReady(true), getChatChunkMountDelayMs())
    return () => {
      window.clearTimeout(t0)
      setChatChunkReady(false)
    }
  }, [activeTab])

  useEffect(() => {
    if (!activityHydratedRef.current) return
    if (shouldSkipDashboardTabRestore()) return
    const snap = buildActivitySnapshot(activityUserId, {
      activeTab,
      tradeView,
      selectedCoinSymbol,
      showBalance,
      liveAnalysis: INACTIVE_LIVE_ANALYSIS,
    })
    const serialized = JSON.stringify(snap)
    if (serialized === activityLastSerializedRef.current) return
    activityLastSerializedRef.current = serialized
    writeDashboardActivity(snap)
  }, [activityUserId, activeTab, tradeView, selectedCoinSymbol, showBalance])

  // Authoritative Postgres workspace replaces tab-local snapshot when bootstrap delivers it.
  useEffect(() => {
    if (shouldSkipDashboardTabRestore()) return
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
      let t = tab === "wallet" || tab === "notifications" ? "history" : tab
      if (operationalWorkspace) {
        if (t === "history" || t === "container" || t === "wallstreet") t = "desk"
      }
      return t
    }
    const tab = coerceTab(parsed.activeTab)

    if (!navCtrl.shouldApplyServerWorkspace()) {
      reportClientDiagnostic({
        kind: "server_workspace_skip",
        message: "recent_user_navigation",
        meta: { requestedTab: tab, currentTab: activeTabRef.current },
      })
      setSelectedCoinSymbol(parsed.selectedCoinSymbol)
      setShowBalance(parsed.showBalance)
      lastServerWorkspaceAppliedRef.current = ser
      return
    }

    setTabProgrammatic(tab, "server_workspace_snapshot")
    setSelectedCoinSymbol(parsed.selectedCoinSymbol)
    setShowBalance(parsed.showBalance)
    const nextSnap = buildActivitySnapshot(activityUserId, {
      activeTab: tab,
      tradeView: parsed.tradeView,
      selectedCoinSymbol: parsed.selectedCoinSymbol,
      showBalance: parsed.showBalance,
      liveAnalysis: INACTIVE_LIVE_ANALYSIS,
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
    navCtrl,
    setTabProgrammatic,
  ])

  // Debounced server persistence for USER_WORKSPACE_STATE (see lib/operational-state-scope.ts).
  useEffect(() => {
    if (!activityHydratedRef.current || !user?.id || isGuestSession) return
    const snap = buildActivitySnapshot(activityUserId, {
      activeTab,
      tradeView,
      selectedCoinSymbol,
      showBalance,
      liveAnalysis: INACTIVE_LIVE_ANALYSIS,
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
    user?.id,
    isGuestSession,
  ])

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
      if (navCtrl.normalizeTab(activeTabRef.current) !== "desk") {
        setTabProgrammatic("desk", "ops_workspace_boot")
      }
    }
  }, [authLoading, user, isGuestSession, operationalWorkspace, navCtrl, setTabProgrammatic])

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

  const profileFundingCountry = useMemo(() => {
    const cc = op.snapshot?.profile?.fundingCountryCode
    return typeof cc === "string" && cc.length >= 2 ? cc.toUpperCase().slice(0, 2) : ""
  }, [op.snapshot?.profile?.fundingCountryCode])

  /** Profile corridor wins — prevents picking another country’s desks/rails in Add Funds. */
  const addFundsCorridorCountry = useMemo(() => {
    if (profileFundingCountry.length === 2) return profileFundingCountry
    return fundingCountryCodeInput.trim().toUpperCase().slice(0, 2)
  }, [profileFundingCountry, fundingCountryCodeInput])

  const ugandaAdminAirtelEligible = isUgandaAdminAirtelEligible(addFundsCorridorCountry)
  const kenyaAdminMpesaEligible = isKenyaAdminMpesaEligible(addFundsCorridorCountry)
  const fundingCountryLocked = profileFundingCountry.length === 2

  const localMmNetworkOptions = useMemo(
    () => mobileNetworksForFundingCountry(addFundsCorridorCountry),
    [addFundsCorridorCountry],
  )

  /** Local MM: amount input is in corridor fiat (UG→UGX), aligned with wallet display currency. */
  const localMmCorridorFiat = useMemo(() => {
    const cc = addFundsCorridorCountry
    return cc.length === 2 ? corridorFiatForCountryIso2(cc) : null
  }, [addFundsCorridorCountry])

  const fundingAmountLabelCurrency =
    l1FundSource === "local" && localMmCorridorFiat
      ? localMmCorridorFiat
      : l1FundSource === "airtel" || l1FundSource === "mpesa_ke"
        ? localMmCorridorFiat ?? currency
        : currency

  const smartAmountLocale = locale || "en-US"

  const smartAmountCurrencyForFund = useMemo(() => {
    if (showFundModal === "withdraw") {
      return localMmCorridorFiat ?? "USD"
    }
    if (showFundModal === "add" && l1FundSource === "crypto") return "USD"
    if (showFundModal === "add" && (l1FundSource === "local" || l1FundSource === "airtel" || l1FundSource === "mpesa_ke")) {
      return fundingAmountLabelCurrency
    }
    return "USD"
  }, [showFundModal, l1FundSource, fundingAmountLabelCurrency, localMmCorridorFiat])

  const handleFundAmountChange = useCallback(
    (raw: string) => {
      setFundAmount(formatAmountInputLive(raw, smartAmountLocale, smartAmountCurrencyForFund))
    },
    [smartAmountLocale, smartAmountCurrencyForFund],
  )

  useEffect(() => {
    if (!fundAmount.trim()) return
    setFundAmount((v) => formatAmountInputLive(v, smartAmountLocale, smartAmountCurrencyForFund))
  }, [smartAmountLocale, smartAmountCurrencyForFund])

  const customerMinDepositDisplay = useMemo(() => {
    const cur =
      showFundModal === "withdraw"
        ? localMmCorridorFiat ?? "USD"
        : l1FundSource === "local" && localMmCorridorFiat
          ? localMmCorridorFiat
          : l1FundSource === "airtel" || l1FundSource === "mpesa_ke"
            ? fundingAmountLabelCurrency
            : l1FundSource === "crypto"
              ? "USD"
              : "USD"
    return formatMinDepositForCustomer(cur, locale || "en-US")
  }, [showFundModal, l1FundSource, localMmCorridorFiat, fundingAmountLabelCurrency, locale])

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

  const localMmFundingCountry = addFundsCorridorCountry

  const localMmMpesaKenya = useMemo(() => {
    if (!localMmSelectedDesk || localMmFundingCountry !== "KE") return null
    if (!/mpesa/i.test(fundMobileNetwork)) return null
    return parseKeMpesaMobileDesk(localMmSelectedDesk.payment_numbers)
  }, [localMmSelectedDesk, fundMobileNetwork, localMmFundingCountry])

  const localMmMtnMobile = useMemo(() => {
    if (!localMmSelectedDesk || fundMobileNetwork !== "MTN" || localMmFundingCountry !== "UG") return null
    const filtered = filterDeskPaymentLinesForNetwork(localMmSelectedDesk.payment_numbers, fundMobileNetwork)
    return parseUgMtnMobileDesk(filtered, localMmSelectedDesk.registered_payee_names)
  }, [localMmSelectedDesk, fundMobileNetwork, localMmFundingCountry])

  const localMmAirtelMerchant = useMemo(() => {
    if (!localMmSelectedDesk || fundMobileNetwork === "MTN" || localMmMpesaKenya) return null
    if (localMmFundingCountry !== "UG") return null
    const filtered = filterDeskPaymentLinesForNetwork(localMmSelectedDesk.payment_numbers, fundMobileNetwork)
    return parseUgAirtelMerchantDesk(filtered, null)
  }, [localMmSelectedDesk, fundMobileNetwork, localMmMpesaKenya, localMmFundingCountry])

  const localMmPaymentRoute = useMemo(() => {
    if (!localMmSelectedDesk) return null
    return deskPaymentRouteForNetwork(
      localMmSelectedDesk.payment_numbers,
      fundMobileNetwork,
      localMmSelectedDesk.registered_payee_names,
    )
  }, [localMmSelectedDesk, fundMobileNetwork])

  useEffect(() => {
    if (isGuestSession || !authReady || authLoading) return
    if (user) return
    if (hasRecentFreshLogin()) return

    let cancelled = false
    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session?.user) return
      router.replace("/auth/login?reason=session_required")
    })()

    return () => {
      cancelled = true
    }
  }, [authReady, authLoading, user, isGuestSession, router])

  /* Email verification is optional when phone + Security PIN exist — no forced sign-out here. */

  const refreshMainBalances = useCallback(async () => {
    if (authLoading || !user || isGuestSession) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const res = await fetch("/api/user/balance", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!res.ok) return

    const json = (await res.json()) as {
      available_balance?: number
      current_stake?: number
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
    setContainerLockedUsd(Number(json.current_stake ?? 0))
    setRetailBalance(Number(json.retail_balance ?? 0))
    setWithdrawalPendingBalance(Number(json.withdrawal_pending_balance ?? 0))
    setTotalEarnings(Number(json.total_earnings ?? 0))
    setActiveContainerEarnings(Number(json.active_container_earnings ?? 0))
    setContainerWithdrawableEarnings(Number(json.container_withdrawable_earnings ?? 0))
    setContainerFeesPaid(Number(json.lifetime_container_fees ?? 0))
  }, [authLoading, user, isGuestSession])

  useEffect(() => {
    void refreshMainBalances()
  }, [refreshMainBalances])

  useOperationalRealtime({
    enabled: Boolean(user?.id) && !isGuestSession && !authLoading,
    role: "trading_user",
    userId: user?.id ?? null,
    onRetailerFundRequests: () => {
      void refreshMainBalances()
      dispatchCustomerLedgerBump("retailer_fund_requests")
    },
    onWithdrawals: () => {
      void refreshMainBalances()
      dispatchCustomerLedgerBump("withdrawal_requests")
    },
    onAccountNotifications: () => {
      void refreshMainBalances()
      dispatchCustomerLedgerBump("user_account_notifications")
    },
    onContainerEvents: () => {
      void refreshMainBalances()
      dispatchCustomerLedgerBump("container_balance_events")
    },
  })

  useEffect(() => {
    const onLedgerBump = () => {
      void refreshMainBalances()
    }
    window.addEventListener(NEXUS_CUSTOMER_LEDGER_BUMP, onLedgerBump)
    return () => window.removeEventListener(NEXUS_CUSTOMER_LEDGER_BUMP, onLedgerBump)
  }, [refreshMainBalances])

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
    setContainerLockedUsd(Number(b.current_stake ?? 0))
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
    if (!ugandaAdminAirtelEligible && l1FundSource === "airtel") {
      setL1FundSource("crypto")
    }
    if (!kenyaAdminMpesaEligible && l1FundSource === "mpesa_ke") {
      setL1FundSource("crypto")
    }
  }, [ugandaAdminAirtelEligible, kenyaAdminMpesaEligible, l1FundSource])

  useEffect(() => {
    if (authLoading || !user || isGuestSession) return
    const cc = op.snapshot?.profile?.fundingCountryCode
    if (typeof cc === "string" && cc.length >= 2) {
      setFundingCountryCodeInput(cc.toUpperCase().slice(0, 2))
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
        showToast("Trading views are disabled for your operational role. Use Desk, Chat, or Settings.", "error")
        return
      }
      if (tab === "wallstreet") {
        setTabUser("chat", "header_wallstreet")
        setChatHubFocus(null)
        setSettingsRequestedView(null)
        return
      }
      setTabUser(tab, "header_tab")
      setChatHubFocus(null)
      setSettingsRequestedView(null)
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "instant" in window ? ("instant" as ScrollBehavior) : "auto" })
        revealMobileHeader()
      }
    },
    [operationalWorkspace, showToast, setTabUser],
  )

  const handleSettingsRequestConsumed = useCallback(() => {
    setSettingsRequestedView(null)
  }, [])

  const handleNotificationNav = useCallback(
    (nav: NexusNotificationNav) => {
      navCtrl.markUserNav()
      reportClientDiagnostic({
        kind: "notification_nav",
        message: nav.kind,
        meta: { nav },
      })
      switch (nav.kind) {
        case "trade":
          setSelectedCoinSymbol(nav.symbol ?? "BTC")
          setTabProgrammatic("container", "notification_nav_trade")
          setContainerDeskOpenNonce((n) => n + 1)
          break
        case "wallet":
          if (operationalWorkspace) {
            setTabProgrammatic("desk", "notification_nav_wallet")
          } else {
            setSettingsRequestedView("deposit-withdraw")
            setTabProgrammatic("settings", "notification_nav_wallet")
          }
          break
        case "notifications":
        case "history":
          setTabProgrammatic("history", "notification_nav_history")
          break
        case "desk":
          setTabProgrammatic("desk", "notification_nav_desk")
          break
        case "settings":
          if (nav.view === "security") {
            router.push("/dashboard/security")
          } else if (nav.view === "deposit-withdraw") {
            router.push("/settings/deposit-withdraw")
          } else {
            setSettingsRequestedView(nav.view as SettingsView)
            setTabProgrammatic("settings", "notification_nav_settings")
          }
          break
        case "orders":
          setSettingsRequestedView("main")
          setTabProgrammatic("settings", "notification_nav_orders")
          break
        case "support_thread":
          if (operationalWorkspace) {
            setSupportThreadFocusId(nav.threadId)
            setTabProgrammatic("desk", "notification_nav_support")
          } else {
            setSupportThreadFocusId(nav.threadId)
            setChatHubFocus("support")
            setTabProgrammatic("chat", "notification_nav_support")
          }
          break
        case "expert-analysis":
          setChatHubFocus("ai")
          setTabProgrammatic("chat", "notification_nav_expert")
          break
        default:
          break
      }
    },
    [operationalWorkspace, navCtrl, setTabProgrammatic, router],
  )

  useEffect(() => {
    if (typeof window === "undefined" || authLoading || supportThreadUrlParsedRef.current) return
    try {
      const u = new URL(window.location.href)
      const raw = u.searchParams.get("supportThread")
      if (!raw?.trim()) {
        supportThreadUrlParsedRef.current = true
        return
      }
      const tid = raw.trim()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tid)) {
        supportThreadUrlParsedRef.current = true
        return
      }
      supportThreadFromUrlRef.current = tid
      supportThreadUrlParsedRef.current = true
      u.searchParams.delete("supportThread")
      const qs = u.searchParams.toString()
      window.history.replaceState({}, "", u.pathname + (qs ? `?${qs}` : ""))
    } catch {
      supportThreadUrlParsedRef.current = true
    }
  }, [authLoading])

  useEffect(() => {
    if (typeof window === "undefined" || authLoading) return
    try {
      const u = new URL(window.location.href)
      const rawTab = (u.searchParams.get("tab") ?? "").trim().toLowerCase()
      if (rawTab === "settings") {
        setTabProgrammatic("settings", "settings_tab_url")
        u.searchParams.delete("tab")
        const qs = u.searchParams.toString()
        window.history.replaceState({}, "", u.pathname + (qs ? `?${qs}` : ""))
      }
    } catch {
      /* ignore */
    }
  }, [authLoading, setTabProgrammatic])

  useEffect(() => {
    if (typeof window === "undefined" || authLoading) return
    try {
      const u = new URL(window.location.href)
      const rawView = (u.searchParams.get("view") ?? "").trim()
      if (!rawView) return
      if (
        rawView === "deposit-withdraw" ||
        rawView === "notifications" ||
        rawView === "about"
      ) {
        setSettingsRequestedView(rawView as SettingsView)
        setTabProgrammatic("settings", "settings_view_url")
      }
      u.searchParams.delete("view")
      const qs = u.searchParams.toString()
      window.history.replaceState({}, "", u.pathname + (qs ? `?${qs}` : ""))
    } catch {
      /* ignore */
    }
  }, [authLoading, setTabProgrammatic])

  useEffect(() => {
    if (typeof window === "undefined" || authLoading) return
    try {
      const u = new URL(window.location.href)
      const raw = u.searchParams.get("tradeCode")?.trim()
      if (!raw) return
      const code = normalizeTradeCode(raw)
      if (!isValidTradeCodeFormat(code)) return
      setTradeCodePrefill(code)
      if (!operationalWorkspace) {
        setTabProgrammatic("container", "trade_code_deeplink")
        setContainerDeskOpenNonce((n) => n + 1)
      }
      u.searchParams.delete("tradeCode")
      const qs = u.searchParams.toString()
      window.history.replaceState({}, "", u.pathname + (qs ? `?${qs}` : ""))
    } catch {
      /* ignore */
    }
  }, [authLoading, operationalWorkspace, setTabProgrammatic])

  useEffect(() => {
    const forceCleanTab = () => {
      reportClientDiagnostic({
        kind: "clean_boot_bfcache",
        message: "dashboard forced clean tab after bfcache",
        meta: { tab: postLoginTab(operationalWorkspace) },
      })
      setSettingsRequestedView(null)
      setChatHubFocus(null)
      setSupportThreadFocusId(null)
      clearDashboardActivity()
      purgeDashboardUnsafeSessionState()
      purgeChromeUnsafeSessionState()
      setTabProgrammatic(postLoginTab(operationalWorkspace), "clean_boot_bfcache_reset")
    }
    window.addEventListener(DASHBOARD_CLEAN_BOOT_RESET_EVENT, forceCleanTab)
    window.addEventListener(CHROME_BFCACHE_RESET_EVENT, forceCleanTab)
    return () => {
      window.removeEventListener(DASHBOARD_CLEAN_BOOT_RESET_EVENT, forceCleanTab)
      window.removeEventListener(CHROME_BFCACHE_RESET_EVENT, forceCleanTab)
    }
  }, [operationalWorkspace, setTabProgrammatic])

  useEffect(() => {
    if (authLoading) return
    if (shouldSkipDashboardTabRestore()) return
    const tid = supportThreadFromUrlRef.current
    if (!tid) return
    if (op.isLoading && !op.snapshot?.profile && Boolean(roleHint?.isOperationalDesk)) return
    setSupportThreadFocusId(tid)
    setTabProgrammatic(operationalWorkspace ? "desk" : "chat", "support_thread_url")
    if (!operationalWorkspace) setChatHubFocus("support")
    supportThreadFromUrlRef.current = null
  }, [
    authLoading,
    operationalWorkspace,
    op.isLoading,
    op.snapshot?.profile,
    roleHint?.isOperationalDesk,
    setTabProgrammatic,
  ])

  const handleNotificationNavRef = useRef(handleNotificationNav)
  handleNotificationNavRef.current = handleNotificationNav

  useEffect(() => {
    registerAppNavigator((nav) => handleNotificationNavRef.current(nav))
    return () => registerAppNavigator(null)
  }, [registerAppNavigator])

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
            current_stake?: number
            withdrawal_pending_balance?: number
          }
          setMainBalance(Number(j.available_balance ?? 0))
          setContainerLockedUsd(Number(j.current_stake ?? 0))
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
    const amt = parseCustomerLocalAmountInput(fundAmount)
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
    const amt = parseCustomerLocalAmountInput(fundAmount)
    if (!(amt > 0) || Number.isNaN(amt)) {
      showToast("Enter the amount you will send.", "error")
      return
    }
    const cc = addFundsCorridorCountry
    if (cc.length !== 2) {
      showToast("Enter your 2-letter country code (e.g. UG, KE).", "error")
      return
    }
    const net = fundMobileNetwork.trim()
    if (!net) {
      showToast("Choose your payment network first (MTN, Airtel, M-Pesa, …).", "error")
      return
    }
    if (!addFundsPayerIsReady(fundPayerSource, fundPayerProfile, fundPayerName, fundPayerPhone)) {
      showToast("Register your mobile money number in Security & Recovery first.", "error")
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
  }, [
    fundAmount,
    addFundsCorridorCountry,
    currency,
    fundMobileNetwork,
    fundPayerName,
    fundPayerPhone,
    fundPayerSource,
    fundPayerProfile,
    showToast,
  ])

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
  }, [addFundsCorridorCountry, fundMobileNetwork, l1FundSource])

  useEffect(() => {
    if (!fundMobileNetwork.trim()) return
    if (!localMmNetworkOptions.includes(fundMobileNetwork)) {
      setFundMobileNetwork("")
    }
  }, [addFundsCorridorCountry, fundMobileNetwork, localMmNetworkOptions])

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
    if (showFundModal !== "add") {
      setLocalMmWizardStep(1)
      setGatewayStep(1)
      setPaymentVerificationStatus("idle")
    }
  }, [showFundModal])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = sessionStorage.getItem("nexus_withdraw_submitted")
      if (!raw) return
      sessionStorage.removeItem("nexus_withdraw_submitted")
      const parsed = JSON.parse(raw) as { amountLabel?: string }
      setWithdrawPendingAckAmount(parsed.amountLabel ?? null)
      setWithdrawPendingAckOpen(true)
      broadcastOperationalBump("notifications")
    } catch {
      setWithdrawPendingAckOpen(true)
      broadcastOperationalBump("notifications")
    }
  }, [])

  useEffect(() => {
    if (!fundPageOnly) return
    setShowFundModal(fundPageOnly)
    setFundAmount("")
    setGatewayStep(1)
    setPaymentVerificationStatus("idle")
    setL1FundSource(fundSourceFromGatewayMethod("mobile_money", addFundsCorridorCountry || "UG"))
  }, [fundPageOnly, addFundsCorridorCountry])

  useBodyScrollLock(Boolean(showFundModal) && !fundPageOnly)

  useEffect(() => {
    const addOpen = showFundModal === "add" || fundPageOnly === "add"
    if (!addOpen || l1FundSource !== "crypto") return
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
  }, [showFundModal, fundPageOnly, l1FundSource])

  const loadWithdrawalEligibility = useCallback(async () => {
    if (isGuestSession || !user || operationalWorkspace) {
      setWithdrawalEligibility(null)
      return
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch("/api/user/withdrawal/eligibility", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!res.ok) return
      const j = (await res.json().catch(() => ({}))) as {
        minUsd?: number
        maxUsd?: number
        cooldownActive?: boolean
        msRemaining?: number
        nextEligibleAt?: string | null
        totalBalanceUsd?: number
      }
      setWithdrawalEligibility({
        minUsd: Number(j.minUsd ?? 0),
        maxUsd: Number(j.maxUsd ?? 0),
        cooldownActive: Boolean(j.cooldownActive),
        msRemaining: Number(j.msRemaining ?? 0),
        nextEligibleAt: j.nextEligibleAt ?? null,
        totalBalanceUsd: Number(j.totalBalanceUsd ?? 0),
      })
    } catch {
      setWithdrawalEligibility(null)
    }
  }, [isGuestSession, user, operationalWorkspace])

  useEffect(() => {
    void loadWithdrawalEligibility()
  }, [loadWithdrawalEligibility])

  useEffect(() => {
    if (showFundModal === "withdraw") void loadWithdrawalEligibility()
  }, [showFundModal, loadWithdrawalEligibility])

  useEffect(() => {
    if (showFundModal !== "withdraw" || withdrawPayoutProfile) return
    let cancelled = false
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token || cancelled) return
      const readiness = await loadWithdrawReadiness(token)
      if (cancelled) return
      if (readiness.ok) {
        setWithdrawPayoutProfile(readiness.profile)
        setSelectedWithdrawPayoutId((prev) => prev ?? defaultWithdrawPayoutOptionId(readiness.profile))
      } else {
        setFundModalError(readiness.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showFundModal, withdrawPayoutProfile])

  const withdrawPayoutOptionsList = useMemo(
    () => withdrawPayoutOptionsFromProfile(withdrawPayoutProfile),
    [withdrawPayoutProfile],
  )

  const tryOpenFundModal = useCallback(
    async (mode: "add" | "withdraw") => {
      if (isGuestSession) return
      setFundModalError(null)
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        showToast(t("withdrawal.error.sessionExpired"), "error")
        return
      }
      let addFundProfile: PublicSecurityProfile | null = null
      if (mode === "withdraw") {
        const readiness = await loadWithdrawReadiness(token)
        if (!readiness.ok) {
          setSecurityGateDetail(readiness.message)
          if (readiness.showSecurityGate) setSecurityGateOpen(true)
          setFundModalError(readiness.message)
          showToast(readiness.message, "error")
          return
        }
        setWithdrawPayoutProfile(readiness.profile)
        setSelectedWithdrawPayoutId(defaultWithdrawPayoutOptionId(readiness.profile))
      } else {
        const { profile, error } = await fetchSecurityProfileForAction(token)
        if (!profile || profile.needsFundingSetup || profile.needsSecurityPin) {
          const msg =
            error ??
            profile?.fundingReminder ??
            (profile?.needsSecurityPin
              ? "Set your 6-digit Nexus Security PIN in Settings before adding funds."
              : "Complete your payment details (number and registered account name) in Settings before adding funds.")
          setSecurityGateDetail(msg)
          setSecurityGateOpen(true)
          showToast(msg, "error")
          return
        }
        addFundProfile = profile
        setWithdrawPayoutProfile(null)
        setSelectedWithdrawPayoutId(null)
        setFundPayerProfile(profile)
      }
      setShowFundModal(mode)
      setFundAmount("")
      setFundModalError(null)
      if (mode === "add") {
        setL1FundSource(fundSourceFromGatewayMethod("mobile_money", addFundsCorridorCountry || "UG"))
        setQualifiedRetailers([])
        setSelectedRetailerId("")
        setFundTxReference("")
        setFundNote("")
        setFundMobileNetwork("")
        setFundPayerSource("manual")
        setCryptoFundingMeta(null)
        setFundPaymentProofDataUrl(null)
        setFundPaymentProofPreview(null)
        if (addFundProfile) {
          applyRegisteredFundPayer(addFundProfile, null)
        } else {
          setFundPayerName("")
          setFundPayerPhone("")
        }
      }
    },
    [isGuestSession, showToast, t, applyRegisteredFundPayer, addFundsCorridorCountry],
  )

  const withdrawSubmitBlockedReason = useMemo(() => {
    if (showFundModal !== "withdraw" || isFundProcessing) return null
    if (!fundAmount.trim() || parseCustomerLocalAmountInput(fundAmount) <= 0) {
      return t("withdrawal.error.enterAmount")
    }
    if (!withdrawPayoutOptionsList.length) {
      return "Register at least one mobile money payout line with account holder name(s) in Settings before you can withdraw."
    }
    if (!selectedWithdrawPayoutId) {
      return "Select a registered payout method below."
    }
    if (withdrawalEligibility?.cooldownActive) {
      return t("withdrawal.error.cooldownActive").replace(
        "{{hours}}",
        String(Math.max(1, Math.ceil(withdrawalEligibility.msRemaining / 3_600_000))),
      )
    }
    if (
      withdrawalEligibility &&
      withdrawalEligibility.maxUsd + 1e-6 < withdrawalEligibility.minUsd
    ) {
      return t("withdrawal.error.nothingWithdrawable")
    }
    return null
  }, [
    showFundModal,
    isFundProcessing,
    fundAmount,
    withdrawPayoutOptionsList,
    selectedWithdrawPayoutId,
    withdrawalEligibility,
    t,
  ])

  const refreshGatewayPaymentStatus = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch("/api/user/retailer-funding?requestsOnly=1", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!res.ok) return
      const json = (await res.json()) as {
        requests?: Array<{ status?: string }>
      }
      const latest = json.requests?.[0]
      const st = String(latest?.status ?? "")
      if (st === "approved" || st === "resolved") {
        setPaymentVerificationStatus("confirmed")
        void refreshMainBalances()
        if (fundPageOnly) {
          setTimeout(() => router.push("/dashboard"), 1200)
        } else {
          setShowFundModal(null)
        }
      } else if (st === "rejected") {
        setPaymentVerificationStatus("failed")
      } else if (st) {
        setPaymentVerificationStatus("pending")
      }
    } catch {
      /* ignore */
    }
  }, [fundPageOnly, refreshMainBalances, router])

  const handleFundSubmit = useCallback(() => {
    const amountRaw = parseCustomerLocalAmountInput(fundAmount)
    /** Withdraw & local mobile-money funding: user types preferred fiat → ledger uses USD-normalized units. */
    const ccFund = addFundsCorridorCountry
    const localFundingFiat = corridorFiatForCountryIso2(ccFund) ?? currency
    let ledgerUsd = amountRaw
    if (showFundModal === "withdraw") {
      ledgerUsd = usdFromCustomerLocalInput(fundAmount, currency)
    } else if (showFundModal === "add" && l1FundSource === "local") {
      ledgerUsd = usdFromCustomerLocalInput(fundAmount, localFundingFiat)
    } else if (showFundModal === "add" && l1FundSource === "airtel") {
      if (!ugandaAdminAirtelEligible) {
        showToast(t("funding.error.corridorRailMismatch"), "error")
        return
      }
      const airtelFiat = corridorFiatForCountryIso2(addFundsCorridorCountry) ?? "UGX"
      ledgerUsd = usdFromCustomerLocalInput(fundAmount, airtelFiat)
    } else if (showFundModal === "add" && l1FundSource === "mpesa_ke") {
      if (!kenyaAdminMpesaEligible) {
        showToast(t("funding.error.corridorRailMismatch"), "error")
        return
      }
      const kesFiat = corridorFiatForCountryIso2(addFundsCorridorCountry) ?? "KES"
      ledgerUsd = usdFromCustomerLocalInput(fundAmount, kesFiat)
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

    if (showFundModal === "withdraw" && withdrawSubmitBlockedReason) {
      setFundModalError(withdrawSubmitBlockedReason)
      if (withdrawPayoutProfile?.needsSetup) {
        setSecurityGateDetail(withdrawSubmitBlockedReason)
        setSecurityGateOpen(true)
      }
      showToast(withdrawSubmitBlockedReason, "error")
      return
    }

    setIsFundProcessing(true)
    setFundModalError(null)
    ;(async () => {
      try {
        const refreshed = await refreshLiveBalanceBeforeAction()
        if (!refreshed.ok) throw new Error(refreshed.error)
        const token = refreshed.token

        if (showFundModal === "withdraw") {
          const readiness = await loadWithdrawReadiness(token)
          if (!readiness.ok) {
            setSecurityGateDetail(readiness.message)
            if (readiness.showSecurityGate) setSecurityGateOpen(true)
            throw new Error(readiness.message)
          }
          setWithdrawPayoutProfile(readiness.profile)
          if (!selectedWithdrawPayoutId) {
            setSelectedWithdrawPayoutId(defaultWithdrawPayoutOptionId(readiness.profile))
          }
        }
        const liveMain = refreshed.balance.available_balance
        const liveRetail = refreshed.balance.retail_balance ?? retailBalance
        const liveWithdrawPending =
          refreshed.balance.withdrawal_pending_balance ?? withdrawalPendingBalance
        setMainBalance(liveMain)
        setContainerLockedUsd(Number(refreshed.balance.current_stake ?? containerLockedUsd))
        setRetailBalance(liveRetail)
        setWithdrawalPendingBalance(liveWithdrawPending)

        if (showFundModal === "withdraw") {
          if (!(amount > 0)) throw new Error(t("withdrawal.error.enterAmount"))
          if (withdrawalEligibility) {
            if (withdrawalEligibility.maxUsd + 1e-6 < withdrawalEligibility.minUsd) {
              throw new Error(t("withdrawal.error.nothingWithdrawable"))
            }
            if (withdrawalEligibility.cooldownActive) {
              throw new Error(
                t("withdrawal.error.cooldownActive").replace(
                  "{{hours}}",
                  String(Math.max(1, Math.ceil(withdrawalEligibility.msRemaining / 3_600_000))),
                ),
              )
            }
            if (amount + 1e-6 < withdrawalEligibility.minUsd) {
              throw new Error(
                t("withdrawal.error.belowMinimum").replace(
                  "{{min}}",
                  formatUserMoney(withdrawalEligibility.minUsd),
                ),
              )
            }
            if (amount > withdrawalEligibility.maxUsd + 1e-6) {
              const locked = Math.max(0, containerLockedUsd)
              throw new Error(
                t("withdrawal.error.aboveWithdrawableMax")
                  .replace("{{max}}", formatUserMoney(withdrawalEligibility.maxUsd))
                  .replace("{{locked}}", formatUserMoney(locked)),
              )
            }
          } else if (amount > liveMain) {
            throw new Error(t("withdrawal.error.insufficientBalance"))
          }
          if (retailerCreditDesk && retailerOpsBlocked) {
            throw new Error(t("withdrawal.error.retailerPendingBlocksWithdraw"))
          }
          if (!selectedWithdrawPayoutId) {
            throw new Error("Select a registered payout method.")
          }
          const res = await fetch("/api/user/withdrawal/request", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              amount,
              currencyContext: currency,
              amountInputLocal: amountRaw,
              inputCurrency: currency,
              payoutOptionId: selectedWithdrawPayoutId,
            }),
          })
          const out = (await res.json().catch(() => ({}))) as {
            error?: string
            balances?: { available_balance?: number; withdrawal_pending_balance?: number }
          }
          if (!res.ok) throw new Error(localizeFundingWithdrawalApiMessage(out.error, t))
          setMainBalance(Number(out.balances?.available_balance ?? mainBalance))
          setWithdrawalPendingBalance(Number(out.balances?.withdrawal_pending_balance ?? withdrawalPendingBalance))
          dispatchCustomerLedgerBump("withdrawal_requests")
          if (fundPageOnly) {
            try {
              sessionStorage.setItem(
                "nexus_withdraw_submitted",
                JSON.stringify({
                  amountLabel: formatLocalFiatAmount(amountRaw || amount, currency, locale),
                }),
              )
            } catch {
              /* private mode */
            }
            router.replace("/dashboard?tab=container")
            return
          }
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
            if (!ugandaAdminAirtelEligible) {
              throw new Error(t("funding.error.corridorRailMismatch"))
            }
            if (!(amount > 0)) throw new Error(t("funding.error.enterFundedAmount"))
            if (!fundTxReference.trim()) throw new Error(t("funding.error.pickDeskAndTxRef"))
            if (!addFundsPayerIsReady(fundPayerSource, fundPayerProfile, fundPayerName, fundPayerPhone)) {
              throw new Error(t("funding.error.senderIdentity"))
            }
            const airtelFiat = corridorFiatForCountryIso2(addFundsCorridorCountry) ?? "UGX"
            const res = await fetch("/api/user/retailer-funding", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                amount,
                amountInputLocal: amountRaw,
                inputCurrency: airtelFiat,
                txReference: fundTxReference.trim(),
                fundChannel: "admin_airtel_ug",
                ...(fundPayerSource === "manual"
                  ? { payerDisplayName: fundPayerName.trim(), payerPhone: fundPayerPhone.trim() }
                  : { payerSource: fundPayerSource }),
                fundingCountryCode: addFundsCorridorCountry,
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

          if (l1FundSource === "mpesa_ke") {
            if (!kenyaAdminMpesaEligible) {
              throw new Error(t("funding.error.corridorRailMismatch"))
            }
            if (!(amount > 0)) throw new Error(t("funding.error.enterFundedAmount"))
            if (!fundTxReference.trim()) throw new Error(t("funding.error.pickDeskAndTxRef"))
            if (!addFundsPayerIsReady(fundPayerSource, fundPayerProfile, fundPayerName, fundPayerPhone)) {
              throw new Error(t("funding.error.senderIdentity"))
            }
            const kesFiat = corridorFiatForCountryIso2(addFundsCorridorCountry) ?? "KES"
            const res = await fetch("/api/user/retailer-funding", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                amount,
                amountInputLocal: amountRaw,
                inputCurrency: kesFiat,
                txReference: fundTxReference.trim(),
                fundChannel: "admin_mpesa_ke",
                ...(fundPayerSource === "manual"
                  ? { payerDisplayName: fundPayerName.trim(), payerPhone: fundPayerPhone.trim() }
                  : { payerSource: fundPayerSource }),
                fundingCountryCode: addFundsCorridorCountry,
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
          if (!addFundsPayerIsReady(fundPayerSource, fundPayerProfile, fundPayerName, fundPayerPhone)) {
            throw new Error(t("funding.error.senderIdentity"))
          }
          const ccSave = addFundsCorridorCountry
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
              ...(fundPayerSource === "manual"
                ? { payerDisplayName: fundPayerName.trim(), payerPhone: fundPayerPhone.trim() }
                : { payerSource: fundPayerSource }),
              ...(localMmSelectedDesk?.payment_rotation_line_id && localMmSelectedDesk?.payment_rotation_pool_id
                ? {
                    paymentRotationLineId: localMmSelectedDesk.payment_rotation_line_id,
                    paymentRotationPoolId: localMmSelectedDesk.payment_rotation_pool_id,
                  }
                : {}),
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
          setL1FundSource(fundSourceFromGatewayMethod("mobile_money", addFundsCorridorCountry || "UG"))
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
        const msg = e instanceof Error ? e.message : t("funding.error.fundActionFailed")
        setFundModalError(msg)
        showToast(msg, "error")
        if (
          showFundModal === "withdraw" &&
          /security|payout|mobile money|settings/i.test(msg)
        ) {
          setSecurityGateDetail(msg)
          setSecurityGateOpen(true)
        }
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
    addFundsCorridorCountry,
    ugandaAdminAirtelEligible,
    retailerOpsBlocked,
    customerRetailFunding,
    retailerCreditDesk,
    formatUserMoney,
    withdrawalPendingBalance,
    withdrawalEligibility,
    withdrawPayoutProfile,
    withdrawSubmitBlockedReason,
    selectedWithdrawPayoutId,
    containerLockedUsd,
    currency,
    localMmWizardStep,
    fundPaymentProofDataUrl,
    t,
    fundPageOnly,
    router,
    locale,
    dispatchCustomerLedgerBump,
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
        ) : op.error && roleHint?.isOperationalDesk ? (
          <p className="max-w-sm text-center text-sm text-destructive">
            Operations profile could not load ({op.error}). Continuing with cached role — open Desk → Human support
            or refresh.
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
    <div
      className={
        fundPageOnly
          ? "w-full"
          : "nexus-mobile-stable nexus-app-shell min-h-screen overflow-x-hidden bg-background pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0"
      }
    >
      {!fundPageOnly ? (
      <>
      {/* Unified mobile app bar — single search/nav hierarchy */}
      <MobileAppBar
        header={
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
        }
      />
      {operationalWorkspace ? (
        <div className="fixed right-2 top-2 z-[60] md:right-4 md:top-4">
          <DashboardWorkspaceRefresh />
        </div>
      ) : null}

      <LaunchStatusBanner />
      <NexusPushAlertsBootstrap operationalWorkspace={operationalWorkspace} />
      <NewMemberCampaignPromoModal />
      {!operationalWorkspace ? (
        <StartupBonusOnboardingOrchestrator
          requestActivateStep={startupActivateRequest}
          onActivateStepHandled={() => setStartupActivateRequest(0)}
          onGoToTrading={() => handleHeaderTabChange("container")}
          onOpenSecuritySetup={() => {
            setSecurityGateDetail(null)
            setSecurityGateOpen(true)
          }}
        />
      ) : null}

      {showRetailBalancePanels && (
        <div className="max-md:hidden">
          <LiveMarketFeedBar
            status={marketFeed.status}
            updatedAt={marketFeed.updatedAt}
            errorMessage={marketFeed.error}
          />
        </div>
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
                    onClick={() => void tryOpenFundModal("add")}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-emerald-600/40 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-700 sm:flex-none"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t("funding.button.addFunds")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void tryOpenFundModal("withdraw")}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-foreground/25 bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted sm:flex-none"
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
      </>
      ) : null}

      {/* Add Fund / Withdraw Modal */}
      {showFundModal && (
        <div
          className={
            fundPageOnly
              ? "relative w-full"
              : "fixed inset-0 z-[100] flex flex-col bg-black/75 pt-[max(0px,env(safe-area-inset-top,0px))] sm:items-center sm:justify-center sm:bg-black/65 sm:p-4 sm:pt-4 sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby="fund-modal-title"
        >
          <div
            className={`flex min-h-0 max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md flex-1 flex-col overflow-hidden sm:max-h-[min(92dvh,720px)] sm:flex-none ${
              customerRetailFunding && showFundModal
                ? "rounded-t-2xl border-0 bg-transparent shadow-none sm:rounded-2xl sm:p-0"
                : "rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl sm:p-5"
            }`}
          >
            {customerRetailFunding && showFundModal ? (
              <div className="flex shrink-0 justify-end px-3 pb-1 pt-2 max-sm:pt-3 sm:absolute sm:right-0 sm:top-0 sm:z-30 sm:p-2">
                <button
                  type="button"
                  onClick={() => {
                    if (fundPageOnly) {
                      router.push("/dashboard")
                      return
                    }
                    setShowFundModal(null)
                    setFundModalError(null)
                  }}
                  aria-label={t("funding.button.close")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#0d1117]/90 text-zinc-300 hover:bg-white/10 max-sm:h-11 max-sm:w-11"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
            <>
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 pb-2 pt-2 max-sm:pt-3 sm:px-0 sm:pb-3 sm:pt-0">
              <h2 id="fund-modal-title" className="text-lg font-bold sm:text-xl">
                {showFundModal === "add" ? t("funding.modal.titleAdd") : t("funding.modal.titleWithdraw")}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowFundModal(null)
                  setFundModalError(null)
                }}
                aria-label={t("funding.button.close")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 max-sm:h-11 max-sm:w-11 max-sm:bg-muted/90"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            </>
            )}

            {showFundModal === "withdraw" ? null : retailerCreditDesk && retailerOpsBlocked ? (
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-muted-foreground">
                {t("funding.retailerOpsBlockedWithdraw")}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-pb-36 px-3 pb-4 [-webkit-overflow-scrolling:touch] max-sm:pb-[calc(13rem+env(safe-area-inset-bottom,0px))] sm:scroll-pb-8 sm:px-0 sm:pb-3">
            {showFundModal === "withdraw" && customerRetailFunding ? (
              <NexusPaymentGatewayCard
                mode="withdraw"
                useSelfServiceFlow={false}
                fundAmount={fundAmount}
                onFundAmountChange={handleFundAmountChange}
                fundAmountLocale={smartAmountLocale}
                fundAmountCurrency={currency}
                isProcessing={isFundProcessing}
                amountHint={`${t("withdrawal.availableLabel")} ${showBalance ? formatUserMoney(mainBalance) : "••••"}`}
                t={t}
              >
                {withdrawPayoutOptionsList.length ? (
                  <div className="space-y-2">
                    <RegisteredPayerPicker
                      options={withdrawPayoutOptionsList}
                      selectedSource={(selectedWithdrawPayoutId ?? "manual") as FundPayerSource}
                      onSelect={(opt) => setSelectedWithdrawPayoutId(opt.id)}
                      t={t}
                    />
                    <p className="text-[10px] text-zinc-500">{t("withdrawal.payoutLockedHint")}</p>
                  </div>
                ) : null}
                {withdrawalEligibility ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-snug text-zinc-400">
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
                        formatUserMoney(withdrawalEligibility.minUsd),
                      )}
                    </p>
                    {withdrawalEligibility.maxUsd + 1e-6 < withdrawalEligibility.minUsd ? (
                      <p className="mt-1 font-medium text-amber-300">
                        {t("withdrawal.error.nothingWithdrawable")}
                      </p>
                    ) : null}
                    <p className="mt-0.5">
                      {t("withdrawal.modal.maxLine").replace(
                        "{{max}}",
                        formatUserMoney(withdrawalEligibility.maxUsd),
                      )}
                    </p>
                  </div>
                ) : null}
              </NexusPaymentGatewayCard>
            ) : null}
            {showFundModal === "withdraw" ? null : customerRetailFunding && showFundModal === "add" ? (
              <NexusPaymentGatewayCard
                mode="add"
                useSelfServiceFlow
                gatewayStep={gatewayStep}
                onGatewayStepChange={setGatewayStep}
                depositTierLabel={
                  fundAmount.trim()
                    ? `${fundAmount} ${smartAmountCurrencyForFund}`
                    : customerMinDepositDisplay
                }
                payerPhone={fundPayerPhone}
                onPayerPhoneChange={setFundPayerPhone}
                onProceedToInstructions={() => {
                  if (!fundPayerPhone.trim() && !fundPayerBinding.hasRegisteredLine) {
                    showToast(t("funding.error.senderIdentity"), "error")
                    return false
                  }
                  if (!(parseCustomerLocalAmountInput(fundAmount) > 0)) {
                    showToast(t("funding.error.enterFundedAmount"), "error")
                    return false
                  }
                  return true
                }}
                onConfirmPaid={() => {
                  if (!fundTxReference.trim() && l1FundSource !== "crypto") {
                    showToast(t("funding.error.pickDeskAndTxRef"), "error")
                    return
                  }
                  setPaymentVerificationStatus("pending")
                  handleFundSubmit()
                }}
                onRefreshPaymentStatus={refreshGatewayPaymentStatus}
                paymentVerificationStatus={paymentVerificationStatus}
                fundTxReference={fundTxReference}
                onTxReferenceChange={(v) => {
                  setFundTxReference(v)
                  setFundTxRefError(null)
                }}
                activeSource={l1FundSource}
                onSourceChange={(s) => {
                  setL1FundSource(s)
                  if (fundPayerProfile) {
                    const net =
                      s === "airtel"
                        ? "Airtel"
                        : s === "mpesa_ke"
                          ? "MPesa"
                          : s === "local"
                            ? fundMobileNetwork
                            : null
                    applyRegisteredFundPayer(fundPayerProfile, net)
                  }
                  if (s === "local") {
                    setLocalMmWizardStep(1)
                    setQualifiedRetailers([])
                    setOfficialCorridorFallback(null)
                    setSelectedOfficialRouteId(null)
                    setSelectedRetailerId("")
                    setLocalMmRetailersSearched(false)
                  }
                }}
                customerFundingCountry={addFundsCorridorCountry}
                fundAmount={fundAmount}
                onFundAmountChange={handleFundAmountChange}
                fundAmountLocale={smartAmountLocale}
                fundAmountCurrency={smartAmountCurrencyForFund}
                minDepositLabel={t("funding.amount.minimumLine").replace(
                  "{{amount}}",
                  customerMinDepositDisplay,
                )}
                amountHint={
                  l1FundSource === "airtel" || l1FundSource === "mpesa_ke"
                    ? t("funding.amount.hintMatchSend")
                    : l1FundSource === "crypto"
                      ? t("funding.payment.cryptoAmountUsdHint")
                      : undefined
                }
                showAmountField={!(l1FundSource === "local" && localMmWizardStep === 1)}
                isProcessing={isFundProcessing}
                t={t}
              >
                <div className="nexus-gateway-rail-details space-y-2 sm:space-y-3 [&_.bg-background]:bg-[#080b10] [&_.bg-card]:bg-[#080b10] [&_.bg-muted]:bg-white/5 [&_.border-border]:border-white/10 [&_.text-foreground]:text-zinc-100 [&_.text-muted-foreground]:text-zinc-400">
                {(l1FundSource === "crypto" ||
                  l1FundSource === "airtel" ||
                  l1FundSource === "mpesa_ke") ? (
                <FundingPaymentPanel
                  detailsOnly
                  hideInlineAmount
                  customerFundingCountry={addFundsCorridorCountry}
                  activeSource={l1FundSource}
                  onSourceChange={setL1FundSource}
                  userEmail={user?.email ?? currentUser?.email ?? ""}
                  fundAmount={fundAmount}
                  onFundAmountChange={handleFundAmountChange}
                  fundAmountLocale={smartAmountLocale}
                  fundAmountCurrency={smartAmountCurrencyForFund}
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
                  savedPayerPhoneMasked={
                    fundPayerBinding.hasRegisteredLine ? fundPayerBinding.displayPhone : null
                  }
                  savedPayerAccountNames={
                    fundPayerBinding.hasRegisteredLine ? fundPayerBinding.displayName : null
                  }
                  savedPayerNetwork={fundPayerBinding.network}
                  savedPayerNetworkLabel={
                    fundPayerBinding.networkLabel ? `${fundPayerBinding.networkLabel} Money` : null
                  }
                  t={t}
                  minDepositLabel={t("funding.amount.minimumLine").replace(
                    "{{amount}}",
                    customerMinDepositDisplay,
                  )}
                  hidePayerIdentityFields={showFundRegisteredPayerPicker}
                />
                ) : null}

                {showFundRegisteredPayerPicker &&
                (l1FundSource === "airtel" ||
                  l1FundSource === "mpesa_ke" ||
                  l1FundSource === "crypto") ? (
                  <RegisteredPayerPicker
                    options={fundPayerOptions}
                    selectedSource={fundPayerSource}
                    onSelect={selectFundPayerOption}
                    t={t}
                  />
                ) : null}

                                {l1FundSource === "local" && localMmWizardStep === 1 ? (
                  <div className="space-y-3 rounded-lg border-2 border-border bg-card p-3 sm:p-4 shadow-sm">
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
                          onChange={(e) => {
                            if (fundingCountryLocked) return
                            setFundingCountryCodeInput(e.target.value.toUpperCase())
                          }}
                          readOnly={fundingCountryLocked}
                          placeholder="UG"
                          autoComplete="country"
                          className={`w-full rounded-md border-2 border-border bg-card px-3 py-2.5 text-sm font-medium uppercase text-foreground ${fundingCountryLocked ? "cursor-default bg-muted/60" : ""}`}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          {t("funding.field.network")}
                        </label>
                        <select
                          value={fundMobileNetwork}
                          onChange={(e) => {
                            const net = e.target.value
                            setFundMobileNetwork(net)
                            if (fundPayerProfile && l1FundSource === "local") {
                              applyRegisteredFundPayer(fundPayerProfile, net)
                            }
                          }}
                          className="w-full rounded-md border-2 border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground"
                        >
                          <option value="">{t("funding.network.select")}</option>
                          {localMmNetworkOptions.map((net) => (
                            <option key={net} value={net}>
                              {net === "MPesa" ? "M-Pesa" : net}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          {t("funding.field.fundingAmount").replace("{{currency}}", fundingAmountLabelCurrency)}
                        </label>
                        <SmartAmountInput
                          value={fundAmount}
                          onValueChange={handleFundAmountChange}
                          locale={smartAmountLocale}
                          currency={smartAmountCurrencyForFund}
                          placeholder={formatLocalFiatAmount(
                            minDepositLocalAmount(fundingAmountLabelCurrency),
                            fundingAmountLabelCurrency,
                            locale || "en-US",
                          )}
                          className="w-full rounded-md border-2 border-border bg-card px-3 py-2.5 font-mono text-sm text-foreground"
                        />
                        <p className="mt-1 text-[11px] font-medium text-muted-foreground">
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
                      {!fundPayerBinding.hasRegisteredLine ? (
                        <>
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
                              className="w-full rounded-md border-2 border-border bg-card px-3 py-2.5 text-sm text-foreground"
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
                              className="w-full rounded-md border-2 border-border bg-card px-3 py-2.5 text-sm text-foreground"
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={loadingQualifiedRetailers}
                      onClick={() => void handleLoadQualifiedRetailers()}
                      className="w-full rounded-lg border-2 border-primary/30 bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50"
                    >
                      {loadingQualifiedRetailers ? t("funding.findingRetailers") : t("funding.continueFindRetailers")}
                    </button>
                  </div>
                ) : null}

                {l1FundSource === "local" && localMmWizardStep === 2 ? (
                  <div className="space-y-2 rounded-lg border-2 border-border bg-card p-2 sm:space-y-3 sm:p-3 shadow-sm">
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
                        {formatLocalFiatAmount(parseCustomerLocalAmountInput(fundAmount) || 0, fundingAmountLabelCurrency, locale)}
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
                            const nums = formatDeskPaymentLinesSummary(r.payment_numbers, fundMobileNetwork)
                            const statusLabel = String(r.liquidity_status ?? "—")
                            const spend = typeof r.spendable_liquidity === "number" ? r.spendable_liquidity.toFixed(0) : "—"
                            const payee =
                              deskPayeeDisplayForNetwork(
                                r.payment_numbers,
                                fundMobileNetwork,
                                r.registered_payee_names,
                              ) ?? ""
                            const networkLogo =
                              fundMobileNetwork === "MTN"
                                ? "MTN"
                                : fundMobileNetwork === "Airtel"
                                  ? "Airtel"
                                  : /mpesa/i.test(fundMobileNetwork)
                                    ? "MPesa"
                                    : null
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
                                <div className="mb-2 flex items-center gap-2">
                                  {networkLogo ? <PaymentNetworkLogo network={networkLogo} size="sm" /> : null}
                                  <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1 font-semibold text-foreground">
                                    {t("funding.deskPrefix")}
                                    {String(r.country_code ?? "").toUpperCase() || "—"}
                                    {r.qualification_verified_desk ? (
                                      <span className="rounded bg-emerald-500/20 px-1.5 py-0 text-[9px] font-bold uppercase text-emerald-800 dark:text-emerald-100">
                                        {t("funding.badge.verified")}
                                      </span>
                                    ) : null}
                                  </p>
                                </div>
                                {nums.length ? (
                                  nums.map((line) => (
                                    <p key={line} className="font-mono text-[10px] text-foreground break-all">
                                      {line}
                                    </p>
                                  ))
                                ) : (
                                  <p className="font-mono text-[10px] text-muted-foreground">
                                    {t("funding.paymentNumbersOnFile")}
                                  </p>
                                )}
                                {payee ? (
                                  <p className="mt-1 text-[10px] font-medium text-foreground/90">
                                    {t("funding.card.payeeName")}: {payee}
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
                          <p className="mt-1 font-mono text-[10px] text-foreground">
                            {formatDeskPaymentLinesSummary(officialCorridorFallback.payment_numbers, fundMobileNetwork).join(" · ") ||
                              t("funding.numbersConfigured")}
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
                        {localMmSelectedDesk && (!localMmPaymentRoute || !localMmPaymentRoute.valid) ? (
                          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                            <p className="font-medium">{t("funding.payment.routeValidationFailedTitle")}</p>
                            <p className="mt-1">{t("funding.payment.routeValidationFailedBody")}</p>
                          </div>
                        ) : null}
                        {localMmSelectedDesk && localMmPaymentRoute?.valid ? (
                          <>
                            <NetworkPaymentCardHeader
                              network={fundMobileNetwork}
                              title={t("funding.payDeskOnlyTitle")}
                              subtitle={`${t("funding.deskPrefix")}${String(localMmSelectedDesk.country_code ?? "").toUpperCase()}`}
                              payeeNumber={
                                localMmMtnMobile?.msisdn ??
                                localMmAirtelMerchant?.merchantId ??
                                formatDeskPaymentLinesSummary(localMmSelectedDesk.payment_numbers, fundMobileNetwork)[0] ??
                                null
                              }
                              payeeName={
                                localMmMtnMobile?.payeeName ??
                                localMmAirtelMerchant?.payeeName ??
                                deskPayeeDisplayForNetwork(
                                  localMmSelectedDesk.payment_numbers,
                                  fundMobileNetwork,
                                  localMmSelectedDesk.registered_payee_names,
                                ) ??
                                null
                              }
                              senderNumber={fundPayerBinding.hasRegisteredLine ? fundPayerBinding.displayPhone : null}
                              senderName={fundPayerBinding.hasRegisteredLine ? fundPayerBinding.displayName : null}
                              amountLabel={formatLocalFiatAmount(
                                parseCustomerLocalAmountInput(fundAmount) || 0,
                                fundingAmountLabelCurrency,
                                locale,
                              )}
                              statusLabel={t("funding.badge.verified")}
                              statusTone="processing"
                              t={t}
                            />
                            <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-[11px] leading-snug sm:p-3 sm:text-xs">
                              <p className="font-medium text-destructive break-words">{t("funding.wrongDestinationWarning")}</p>
                            </div>
                            <RetailerPaymentInstructionPanel
                              mpesa={/mpesa/i.test(fundMobileNetwork) ? localMmMpesaKenya : null}
                              mtn={fundMobileNetwork === "MTN" ? localMmMtnMobile : null}
                              airtel={
                                fundMobileNetwork === "Airtel" && localMmAirtelMerchant
                                  ? {
                                      ussdPrefix: localMmAirtelMerchant.ussdPrefix,
                                      merchantId: localMmAirtelMerchant.merchantId,
                                    }
                                  : null
                              }
                              instructionPayeeRaw={deskPayeeDisplayForNetwork(
                                localMmSelectedDesk.payment_numbers,
                                fundMobileNetwork,
                                localMmSelectedDesk.registered_payee_names,
                              )}
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
                        ) : null}
                        {localMmSelectedOfficial ? (
                          <div className="space-y-1 rounded-md border border-sky-600/40 bg-sky-500/10 p-3 text-[11px] sm:text-xs dark:text-sky-50">
                            <p className="font-semibold text-sky-900 dark:text-sky-100">{t("funding.officialReceiveTitle")}</p>
                            <p>
                              {t("funding.officialPayee")} <strong>{localMmSelectedOfficial.payee_display_name}</strong>
                            </p>
                            <p className="font-mono break-all">
                              {formatDeskPaymentLinesSummary(
                                localMmSelectedOfficial.payment_numbers,
                                fundMobileNetwork,
                              ).join(" · ") || t("funding.numbersConfigured")}
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
                          {r.tx_reference.slice(0, 18)} • {fundRequestReceiptLabel(r)} •{" "}
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
              </NexusPaymentGatewayCard>
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
                          {fundRequestReceiptLabel(r)} · {r.tx_reference.slice(0, 16)} ·{" "}
                          {r.mobile_network ?? "MM"}
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
            <div
              className={`shrink-0 space-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-2 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[110] max-sm:mx-auto max-sm:max-w-md max-sm:w-full max-sm:px-3 max-sm:pb-[max(1rem,env(safe-area-inset-bottom,0px))] max-sm:pt-2.5 sm:relative sm:z-20 sm:rounded-none sm:px-0 sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pt-3 ${
                customerRetailFunding && showFundModal
                  ? "border-t border-white/5 bg-[#0d1117]/95 max-sm:rounded-t-xl max-sm:shadow-[0_-10px_32px_rgba(0,0,0,0.45)] sm:border-0 sm:bg-transparent sm:shadow-none"
                  : "border-t border-border/80 bg-card shadow-[0_-6px_24px_rgba(0,0,0,0.16)] max-sm:rounded-t-xl max-sm:border-border max-sm:bg-card max-sm:shadow-[0_-10px_32px_rgba(0,0,0,0.32)]"
              }`}
            >
            {retailerCreditDesk && (
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
                <SmartAmountInput
                  value={fundAmount}
                  onValueChange={handleFundAmountChange}
                  locale={smartAmountLocale}
                  currency={smartAmountCurrencyForFund}
                  placeholder={formatLocalFiatAmount(
                    minDepositLocalAmount(smartAmountCurrencyForFund),
                    smartAmountCurrencyForFund,
                    locale || "en-US",
                  )}
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
                {showFundModal === "withdraw" && withdrawPayoutOptionsList.length ? (
                  <div className="mt-3">
                    <RegisteredPayerPicker
                      options={withdrawPayoutOptionsList}
                      selectedSource={(selectedWithdrawPayoutId ?? "manual") as FundPayerSource}
                      onSelect={(opt) => setSelectedWithdrawPayoutId(opt.id)}
                      t={t}
                    />
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {t("withdrawal.payoutLockedHint")}
                    </p>
                  </div>
                ) : null}
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
                        formatUserMoney(withdrawalEligibility.minUsd),
                      )}
                    </p>
                    {withdrawalEligibility.maxUsd + 1e-6 < withdrawalEligibility.minUsd ? (
                      <p className="mt-1 font-medium text-amber-800 dark:text-amber-200">
                        {t("withdrawal.error.nothingWithdrawable")}
                      </p>
                    ) : null}
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
              {showFundModal === "withdraw" &&
              !withdrawPayoutOptionsList.length &&
              !isFundProcessing ? (
                <div
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100"
                  role="status"
                >
                  <p className="font-medium">Withdrawal details required</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-100/90">
                    Add your Nexus Security PIN and at least one mobile money number in Settings before withdrawing.
                  </p>
                  <button
                    type="button"
                    className="mt-2 flex min-h-11 w-full touch-manipulation items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
                    onClick={() => {
                      setSecurityGateDetail(
                        "Set your 6-digit Nexus Security PIN and register a mobile money number to withdraw.",
                      )
                      setSecurityGateOpen(true)
                    }}
                  >
                    Update details now
                  </button>
                </div>
              ) : null}
              {fundModalError ? (
                <p
                  className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  role="alert"
                >
                  {fundModalError}
                </p>
              ) : null}
              {showFundModal === "withdraw" &&
              withdrawSubmitBlockedReason &&
              !fundModalError &&
              !isFundProcessing ? (
                <p className="text-xs leading-relaxed text-muted-foreground" role="status">
                  {withdrawSubmitBlockedReason}
                </p>
              ) : null}
              {showFundModal === "add" &&
              customerRetailFunding &&
              l1FundSource === "local" &&
              localMmWizardStep === 2 ? (
                <p className="text-[10px] text-muted-foreground">
                  {!localMmSelectedDesk && !selectedOfficialRouteId
                    ? t("withdrawal.status.selectDesk")
                    : !fundTxReference.trim()
                      ? t("withdrawal.status.enterTxRef")
                      : !addFundsPayerIsReady(fundPayerSource, fundPayerProfile, fundPayerName, fundPayerPhone)
                        ? t("withdrawal.status.senderRequired")
                        : !fundMobileNetwork.trim() || addFundsCorridorCountry.length !== 2
                          ? t("withdrawal.status.countryNetwork")
                          : !(parseCustomerLocalAmountInput(fundAmount) > 0)
                            ? t("withdrawal.status.amountMissing")
                            : t("withdrawal.status.readyConfirm")}
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleFundSubmit}
                disabled={
                  isFundProcessing ||
                  (showFundModal === "withdraw" &&
                    (Boolean(withdrawSubmitBlockedReason) ||
                      (withdrawalEligibility != null &&
                        (withdrawalEligibility.cooldownActive ||
                          withdrawalEligibility.maxUsd + 1e-6 < withdrawalEligibility.minUsd)))) ||
                  (showFundModal === "withdraw" && (!fundAmount || parseCustomerLocalAmountInput(fundAmount) <= 0)) ||
                  (showFundModal === "add" &&
                    customerRetailFunding &&
                    (l1FundSource === "pick" ||
                      (l1FundSource === "crypto" &&
                        (!fundTxReference.trim() ||
                          Boolean(fundTxRefError) ||
                          !(parseCustomerLocalAmountInput(fundAmount) > 0))) ||
                      (l1FundSource === "airtel" &&
                        (!ugandaAdminAirtelEligible ||
                          !fundTxReference.trim() ||
                          Boolean(fundTxRefError) ||
                          !addFundsPayerIsReady(
                            fundPayerSource,
                            fundPayerProfile,
                            fundPayerName,
                            fundPayerPhone,
                          ) ||
                          !(parseCustomerLocalAmountInput(fundAmount) > 0))) ||
                      (l1FundSource === "mpesa_ke" &&
                        (!kenyaAdminMpesaEligible ||
                          !fundTxReference.trim() ||
                          Boolean(fundTxRefError) ||
                          !addFundsPayerIsReady(
                            fundPayerSource,
                            fundPayerProfile,
                            fundPayerName,
                            fundPayerPhone,
                          ) ||
                          !(parseCustomerLocalAmountInput(fundAmount) > 0))))) ||
                  (showFundModal === "add" && retailerCreditDesk) ||
                  (showFundModal === "add" && (currentUser?.level ?? 1) === 5) ||
                  (showFundModal === "add" &&
                    customerRetailFunding &&
                    l1FundSource === "local" &&
                    (localMmWizardStep !== 2 ||
                      (!localMmSelectedDesk && !selectedOfficialRouteId) ||
                      !fundTxReference.trim() ||
                      Boolean(fundTxRefError) ||
                      !addFundsPayerIsReady(fundPayerSource, fundPayerProfile, fundPayerName, fundPayerPhone) ||
                      !fundMobileNetwork.trim() ||
                      addFundsCorridorCountry.length !== 2 ||
                      !(parseCustomerLocalAmountInput(fundAmount) > 0)))
                }
                className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg py-3 text-base font-semibold text-white transition-colors disabled:opacity-50 ${
                  showFundModal === "add"
                    ? customerRetailFunding
                      ? "bg-emerald-600 shadow-[0_0_24px_rgba(0,184,124,0.25)] hover:bg-emerald-500"
                      : "bg-success hover:bg-success/90"
                    : "bg-primary hover:bg-primary/90"
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
                        formatLocalFiatAmount(parseCustomerLocalAmountInput(fundAmount) || 0, currency, locale),
                      )
                    : t("withdrawal.cta.withdraw")
                ) : customerRetailFunding && showFundModal === "add" && l1FundSource === "local" && localMmWizardStep === 2 ? (
                  t("funding.cta.confirmPayment")
                ) : customerRetailFunding && showFundModal === "add" ? (
                  "Proceed to Deposit"
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

      {!fundPageOnly ? (
      <>
      {/* Main Content — Container desk + Chat hub (no legacy Wallstreet deck). */}
      <div
        key={activeTab}
        className={`nexus-tab-panel mx-auto max-w-[1600px] px-4 pb-24 md:px-6 md:pb-6 ${activeTab === "container" ? "" : "pt-4 md:pt-5"}`}
      >
        {activeTab === "container" && (
          <div className="space-y-4">
            {!operationalWorkspace ? (
              <StartupBonusCampaignPanelSection
                onStartTrading={() => {
                  handleHeaderTabChange("container")
                  setStartupActivateRequest((n) => n + 1)
                }}
              />
            ) : null}
            {showRetailBalancePanels ? (
              <RetailBalanceHomePanels
                t={t}
                formatUserMoney={formatUserMoney}
                showBalance={showBalance}
                onToggleShowBalance={() => setShowBalance((v) => !v)}
                fullName={currentUser?.fullName}
                mainBalance={mainBalance}
                containerLockedUsd={containerLockedUsd}
                activeContainerTradeCount={containerActiveTradeCount}
                totalEarnings={totalEarnings}
                containerWithdrawableEarnings={containerWithdrawableEarnings}
                withdrawalPendingBalance={withdrawalPendingBalance}
                isContainerFlowBusy={isContainerFlowBusy}
                withdrawalEligibility={withdrawalEligibility}
                onAddFunds={() => {
                  router.push("/recharge")
                }}
                onWithdraw={() => router.push("/recharge?mode=withdraw")}
                onTransferToMain={() => void runContainerFlowAction("transfer_to_main")}
              />
            ) : null}
            {!operationalWorkspace ? (
              <DeferredMount
                idleMs={200}
                placeholder={null}
              >
                <DashboardTestimonialStrip
                  visible={testimonialNotif.visible}
                  text={testimonialNotif.text}
                  onDismiss={testimonialNotif.dismiss}
                  inFlowOnMobile
                />
              </DeferredMount>
            ) : null}
            <ContainerDeskSection
              sidebar={sidebarPanel}
              expandLabel={t("home.trading.expand")}
              collapseLabel={t("home.trading.collapse")}
              activeTradeCount={containerActiveTradeCount}
              deskOpenNonce={containerDeskOpenNonce}
            >
              <NexusBotWorkspace
                mainBalanceUsd={mainBalance}
                onActiveSessionCountsChange={handleContainerSessionCounts}
                initialTradeCode={tradeCodePrefill}
              />
            </ContainerDeskSection>
          </div>
        )}

        {activeTab === "chat" && chatChunkReady ? (
          <main className="relative min-w-0">
            <DashboardPanelErrorBoundary
              panel="Chat"
              onReset={() => {
                setChatChunkReady(false)
                window.setTimeout(() => setChatChunkReady(true), getChatChunkMountDelayMs())
              }}
            >
              <DeferredMount idleMs={80} placeholder={<PanelLoader label="Loading chat…" />}>
                <ChatHubScreen
                  isGuestSession={isGuestSession}
                  initialFocus={chatHubFocus}
                  supportThreadFocusId={supportThreadFocusId}
                  onSupportThreadFocusConsumed={() => setSupportThreadFocusId(null)}
                  showOperationalInboxHint={level5Operational}
                  onGoToOperationalInbox={() => setTabUser("desk", "retailer_inbox_cta")}
                />
              </DeferredMount>
            </DashboardPanelErrorBoundary>
          </main>
        ) : null}

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

        {!operationalWorkspace && activeTab === "history" ? <HistoryCenterScreen /> : null}

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

      {!isGuestSession && (
        <div className="mx-auto max-w-[1600px] space-y-2 px-4 pb-1">
          <EmailVerificationReminderBanner />
          <OptionalSecurityReminderBanner
            onOpenSettings={() => {
              setChatHubFocus(null)
              setSupportThreadFocusId(null)
              router.push("/settings/deposit-withdraw")
            }}
          />
        </div>
      )}

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

      <SecuritySetupGateDialog
        open={securityGateOpen}
        detail={securityGateDetail}
        onClose={() => {
          setSecurityGateOpen(false)
          setSecurityGateDetail(null)
        }}
        onUpdateDetailsNow={() => {
          setSecurityGateOpen(false)
          setSecurityGateDetail(null)
          setChatHubFocus(null)
          setSupportThreadFocusId(null)
          router.push("/settings/deposit-withdraw")
        }}
      />

      {withdrawPendingAckOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-pending-ack-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-[#0d1117] p-5 shadow-2xl">
            <h2 id="withdraw-pending-ack-title" className="text-lg font-semibold text-white">
              Waiting for approval
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              {withdrawPendingAckAmount
                ? `Your withdrawal of ${withdrawPendingAckAmount} has been submitted and is pending review.`
                : "Your withdrawal has been submitted and is pending review."}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              We sent a notification to your inbox. You will be updated when processing completes.
            </p>
            <button
              type="button"
              className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500"
              onClick={() => {
                setWithdrawPendingAckOpen(false)
                setWithdrawPendingAckAmount(null)
              }}
            >
              Back to dashboard
            </button>
          </div>
        </div>
      ) : null}

      {!isGuestSession ? <TradeCelebrationBootstrap /> : null}
      </>
      ) : null}

    </div>
  )
}
