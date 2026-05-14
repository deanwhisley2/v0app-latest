/**
 * Copy-trade session lifecycle states (server-authoritative).
 * Legacy DB rows may still read `closed` until migration maps them to `settled`.
 */
export type CopySessionStatus =
  | "active"
  | "pending_settlement"
  | "settled"
  | "force_closed"
  | "failed_settlement"
  | "archived"

export const COPY_SESSION_TERMINAL_STATUSES: readonly CopySessionStatus[] = [
  "settled",
  "force_closed",
  "failed_settlement",
  "archived",
] as const

export function isCopySessionTerminalStatus(s: string | null | undefined): boolean {
  if (!s) return false
  return (COPY_SESSION_TERMINAL_STATUSES as readonly string[]).includes(s)
}

export function isCopySessionActiveRow(status: string | null | undefined, settledAt: string | null | undefined): boolean {
  return status === "active" && (settledAt == null || settledAt === "")
}

/** Normalize historical / edge DB strings for comparisons in app code. */
export function normalizeCopySessionStatusForUi(status: string | null | undefined): CopySessionStatus | "closed" | string {
  if (status === "closed") return "settled"
  return status ?? "unknown"
}
