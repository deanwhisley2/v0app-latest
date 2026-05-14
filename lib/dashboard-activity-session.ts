/**
 * Persists dashboard navigation + live analysis in sessionStorage for same-tab refresh.
 * Cross-device truth: `profiles.operational_workspace` via `/api/user/operational-workspace` + bootstrap.
 */
import type { Coin } from "@/lib/coins-data"
import { coinsData } from "@/lib/coins-data"
import type { DashboardTradeView } from "@/lib/dashboard-trade-view"
import { DASHBOARD_TRADE_VIEWS } from "@/lib/dashboard-trade-view"

const STORAGE_KEY = "nexus_dashboard_activity_v2"

/** `desk` = operational command center (formerly Wallet). `notifications` replaced Wallet for retail users. */
const MAIN_TABS = new Set(["container", "wallstreet", "notifications", "settings", "desk"])
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
    const rawTab = typeof j.activeTab === "string" ? j.activeTab : ""
    const activeTab =
      rawTab === "trade" || rawTab === "markets"
        ? "container"
        : rawTab === "wallet"
          ? "notifications"
          : MAIN_TABS.has(rawTab)
            ? rawTab
            : "container"
    const tradeView: DashboardTradeView =
      typeof j.tradeView === "string" && TRADE_VIEW_SET.has(j.tradeView as DashboardTradeView)
        ? (j.tradeView as DashboardTradeView)
        : "overview"
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

/** Remote (Postgres) workspace JSON — same schema as sessionStorage payload. */
export function hydrateWorkspaceFromRemote(raw: unknown, expectedUserId: string): DashboardActivitySnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const j = raw as Partial<DashboardActivitySnapshot>
  if (j.v !== 2 || typeof j.userId !== "string" || j.userId !== expectedUserId) return null
  return parseSnapshot(JSON.stringify(raw))
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
    activeTab: MAIN_TABS.has(state.activeTab) ? state.activeTab : "container",
    tradeView: TRADE_VIEW_SET.has(state.tradeView) ? state.tradeView : "overview",
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
