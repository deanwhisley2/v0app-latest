export type FixedSessionStatus =
  | "active"
  | "completed"
  | "matured"
  | "pending_settlement"
  | "failed_settlement"
  | "archived"
  | "cancelled_early"
  | "emergency_closed"

export const FIXED_SESSION_TERMINAL_SUCCESS: readonly FixedSessionStatus[] = ["matured", "completed", "archived"] as const

export function isFixedSessionMaturedLike(status: string | null | undefined): boolean {
  if (!status) return false
  return (FIXED_SESSION_TERMINAL_SUCCESS as readonly string[]).includes(status)
}
