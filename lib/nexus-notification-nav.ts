/** Deep-link targets from notifications (interpreted by dashboard). */
export type NexusNotificationNav =
  | { kind: "trade"; symbol?: string }
  | { kind: "wallet" }
  | { kind: "settings"; view: "security" | "about" | "notifications" }
  | { kind: "orders" }
  | { kind: "detail" }
