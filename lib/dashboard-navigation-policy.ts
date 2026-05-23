/**
 * Central dashboard navigation policy — deterministic tabs, login landing, persistence allowlist.
 * UI state only; no financial logic.
 */

export const DASHBOARD_MAIN_TABS = [
  "container",
  "chat",
  "notifications",
  "settings",
  "desk",
] as const

export type DashboardMainTab = (typeof DASHBOARD_MAIN_TABS)[number]

export const SESSION_ACTIVITY_KEY = "nexus_dashboard_activity_v2"
export const SESSION_PENDING_NAV_KEY = "nexus_pending_nav"
/** Must be set when user explicitly taps a notification link (not realtime). */
export const SESSION_PENDING_NAV_USER_KEY = "nexus_pending_nav_user_initiated"
/** Set on successful login/register before /dashboard navigation. */
export const SESSION_FRESH_LOGIN_KEY = "nexus_auth_fresh_landing"

/** Fields allowed in session + operational_workspace persistence. */
export const PERSISTED_WORKSPACE_FIELDS = [
  "activeTab",
  "tradeView",
  "selectedCoinSymbol",
  "showBalance",
  "live",
] as const

/** Mobile overlay z-index stack (bottom → top). Keep FAB below nav chrome where noted. */
export const MOBILE_Z = {
  main: 0,
  liveOverlay: 20,
  testimonial: 45,
  joelinFab: 48,
  bottomNav: 50,
  joelinPanel: 52,
  fundModalBackdrop: 100,
  fundModalFooter: 110,
} as const

const TAB_SET = new Set<string>(DASHBOARD_MAIN_TABS)

export function isDashboardMainTab(tab: string): tab is DashboardMainTab {
  return TAB_SET.has(tab)
}

export function normalizeDashboardTab(
  raw: string,
  opts: { operationalWorkspace: boolean },
): DashboardMainTab {
  let t = raw === "wallet" || raw === "trade" || raw === "markets" ? "container" : raw
  if (!TAB_SET.has(t)) t = "container"
  if (opts.operationalWorkspace) {
    if (t === "notifications" || t === "container" || t === "wallstreet") return "desk"
  } else {
    if (t === "desk") return "container"
  }
  return t as DashboardMainTab
}

/** Canonical first screen after auth (per role). */
export function postLoginTab(operationalWorkspace: boolean): DashboardMainTab {
  return operationalWorkspace ? "desk" : "container"
}

export function storeUserInitiatedPendingNav(nav: unknown): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(SESSION_PENDING_NAV_KEY, JSON.stringify(nav))
    sessionStorage.setItem(SESSION_PENDING_NAV_USER_KEY, "1")
  } catch {
    /* ignore */
  }
}

export function consumeUserInitiatedPendingNav(): unknown | null {
  if (typeof window === "undefined") return null
  try {
    if (sessionStorage.getItem(SESSION_PENDING_NAV_USER_KEY) !== "1") return null
    const raw = sessionStorage.getItem(SESSION_PENDING_NAV_KEY)
    sessionStorage.removeItem(SESSION_PENDING_NAV_USER_KEY)
    sessionStorage.removeItem(SESSION_PENDING_NAV_KEY)
    if (!raw) return null
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function markFreshLoginLanding(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(SESSION_FRESH_LOGIN_KEY, String(Date.now()))
    sessionStorage.removeItem(SESSION_PENDING_NAV_KEY)
    sessionStorage.removeItem(SESSION_PENDING_NAV_USER_KEY)
  } catch {
    /* ignore */
  }
}

export function consumeFreshLoginLanding(): boolean {
  if (typeof window === "undefined") return false
  try {
    const raw = sessionStorage.getItem(SESSION_FRESH_LOGIN_KEY)
    if (!raw) return false
    sessionStorage.removeItem(SESSION_FRESH_LOGIN_KEY)
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return true
    return Date.now() - ts < 120_000
  } catch {
    return false
  }
}
