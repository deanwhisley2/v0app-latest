/** Deep-link targets from notifications (interpreted by dashboard). */
export type NexusNotificationNav =
  | { kind: "trade"; symbol?: string }
  /** @deprecated DB rows may still emit `wallet`; dashboard maps to money settings or desk. */
  | { kind: "wallet" }
  | { kind: "notifications" }
  /** Operational liquidity desk (formerly Wallet tab). */
  | { kind: "desk" }
  | { kind: "settings"; view: "security" | "about" | "notifications" | "deposit-withdraw" }
  | { kind: "orders" }
  | { kind: "expert-analysis"; analysisId: string }
  | { kind: "detail" }
  /** Operational support / appeals thread (wallet → Assets → Support). */
  | { kind: "support_thread"; threadId: string }
