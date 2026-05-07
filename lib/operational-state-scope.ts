/**
 * Architectural classification: what may live only in-browser vs must be server-backed.
 *
 * Principle: browsers are viewports — CRITICAL_OPERATOR truth belongs in Postgres + runtime authority.
 */

export const OPERATIONAL_STATE_SCOPE = {
  /** Safe to discard per-device; never used for reconciliation or fills. */
  UI_ONLY_LOCAL: [
    "theme",
    "fontScale",
    "panel_drag_drafts",
    "transient_hover",
    "dev_tools_open",
    "toast_position_ephemeral",
  ] as const,
  /** Persist server-side — user-visible command center parity across tabs/devices. */
  USER_WORKSPACE_STATE: [
    "dashboard_activity_v2",
    "selected_coin",
    "active_tab",
    "trade_view_mode",
    "live_overlay_state",
    "settings_panel_prefs",
    "notifications_inbox",
    "operational_preferences",
    "layout_chrome",
  ] as const,
  /** Must reconcile against exchange + Postgres — never authoritative in localStorage alone. */
  CRITICAL_OPERATOR: [
    "trade_sessions",
    "position_state",
    "execution_state",
    "startup_resume_gate",
    "engine_governance",
    "daemon_symbol_runtime",
    "orchestration_leases",
    "exchange_bindings",
    "simulation_run_rows",
    "risk_cooldown_state",
    "telemetry_observability_aggregate",
    "fills_orders",
    "ledger_balances",
  ] as const,
} as const
