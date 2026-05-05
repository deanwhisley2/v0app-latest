export type DashboardTradeView =
  | "live-trading"
  | "order-history"
  | "watchlist"
  | "favorites"
  | "analytics"

export const DASHBOARD_TRADE_VIEWS: DashboardTradeView[] = [
  "live-trading",
  "order-history",
  "watchlist",
  "favorites",
  "analytics",
]

export const TRADE_VIEW_LABELS: Record<DashboardTradeView, string> = {
  "live-trading": "Live Trading",
  "order-history": "Order History",
  watchlist: "Watchlist",
  favorites: "Favorites",
  analytics: "Analytics",
}

/** Short labels for compact mobile subnav */
export const TRADE_VIEW_SHORT: Record<DashboardTradeView, string> = {
  "live-trading": "Live",
  "order-history": "Orders",
  watchlist: "Watch",
  favorites: "Stars",
  analytics: "Stats",
}
