/** Legacy session field — single desk view after live-trading / markets removal. */
export type DashboardTradeView = "overview"

export const DASHBOARD_TRADE_VIEWS: DashboardTradeView[] = ["overview"]

export const TRADE_VIEW_LABELS: Record<DashboardTradeView, string> = {
  overview: "Desk",
}

export const TRADE_VIEW_SHORT: Record<DashboardTradeView, string> = {
  overview: "Desk",
}
