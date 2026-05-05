/**
 * Persists dashboard navigation + live analysis in sessionStorage so a normal
 * page refresh does not wipe the user's current activity (same browser tab session).
 * Cleared on logout (see dashboard handleLogout).
 */
import type { Coin } from "@/lib/coins-data"
import { coinsData } from "@/lib/coins-data"
import type { DashboardTradeView } from "@/lib/dashboard-trade-view"
import { DASHBOARD_TRADE_VIEWS } from "@/lib/dashboard-trade-view"

const STORAGE_KEY = "nexus_dashboard_activity_v2"

const MAIN_TABS = new Set(["trade", "wallstreet", "wallet", "settings"])
const TRADE_VIEW_SET = new Set<string>(DASHBOARD_TRADE_VIEWS)

export type DashboardActivitySnapshot = {
  v: 2
  userId: string
  activeTab: string
  tradeView: DashboardTradeView
  selectedCoinSymbol: string
  showBalance: boolean
  live: {
    active: boolean
    coinSymbol: string | null
    strategies: string[]
    expertMode: boolean
    autoTrade: boolean
    tradeAmount: number
  }
}

function normalizeSymbol(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "BTC"
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return s || "BTC"
}

export function resolveCoinForSession(symbol: string | null | undefined, catalog: Coin[]): Coin | null {
  const s = normalizeSymbol(symbol)
  return catalog.find((c) => c.symbol === s) ?? coinsData.find((c) => c.symbol === s) ?? null
}

function parseSnapshot(raw: string): DashboardActivitySnapshot | null {
  try {
    const j = JSON.parse(raw) as Partial<DashboardActivitySnapshot>
    if (j.v !== 2 || typeof j.userId !== "string") return null
    const activeTab = typeof j.activeTab === "string" && MAIN_TABS.has(j.activeTab) ? j.activeTab : "trade"
    const tradeView =
      typeof j.tradeView === "string" && TRADE_VIEW_SET.has(j.tradeView)
        ? (j.tradeView as DashboardTradeView)
        : "live-trading"
    const selectedCoinSymbol = normalizeSymbol(j.selectedCoinSymbol)
    const showBalance = typeof j.showBalance === "boolean" ? j.showBalance : true
    const liveRaw = j.live
    const live = {
      active: Boolean(liveRaw?.active),
      coinSymbol:
        typeof liveRaw?.coinSymbol === "string" ? normalizeSymbol(liveRaw.coinSymbol) : null,
      strategies: Array.isArray(liveRaw?.strategies)
        ? liveRaw.strategies.filter((x): x is string => typeof x === "string").slice(0, 32)
        : [],
      expertMode: Boolean(liveRaw?.expertMode),
      autoTrade: Boolean(liveRaw?.autoTrade),
      tradeAmount:
        typeof liveRaw?.tradeAmount === "number" && Number.isFinite(liveRaw.tradeAmount) && liveRaw.tradeAmount > 0
          ? Math.min(1_000_000, liveRaw.tradeAmount)
          : 100,
    }
    return {
      v: 2,
      userId: j.userId,
      activeTab,
      tradeView,
      selectedCoinSymbol,
      showBalance,
      live,
    }
  } catch {
    return null
  }
}

export function readDashboardActivity(currentUserId: string): DashboardActivitySnapshot | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const snap = parseSnapshot(raw)
    if (!snap || snap.userId !== currentUserId) return null
    return snap
  } catch {
    return null
  }
}

export function writeDashboardActivity(snapshot: DashboardActivitySnapshot): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    /* quota / private mode */
  }
}

export function clearDashboardActivity(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function buildActivitySnapshot(
  userId: string,
  state: {
    activeTab: string
    tradeView: DashboardTradeView
    selectedCoinSymbol: string
    showBalance: boolean
    liveAnalysis: {
      active: boolean
      coin: Coin | null
      strategies: string[]
      expertMode: boolean
      autoTrade: boolean
      tradeAmount: number
    }
  }
): DashboardActivitySnapshot {
  return {
    v: 2,
    userId,
    activeTab: MAIN_TABS.has(state.activeTab) ? state.activeTab : "trade",
    tradeView: TRADE_VIEW_SET.has(state.tradeView) ? state.tradeView : "live-trading",
    selectedCoinSymbol: normalizeSymbol(state.selectedCoinSymbol),
    showBalance: state.showBalance,
    live: {
      active: state.liveAnalysis.active,
      coinSymbol: state.liveAnalysis.coin?.symbol ?? null,
      strategies: state.liveAnalysis.strategies.slice(0, 32),
      expertMode: state.liveAnalysis.expertMode,
      autoTrade: state.liveAnalysis.autoTrade,
      tradeAmount: state.liveAnalysis.tradeAmount,
    },
  }
}
