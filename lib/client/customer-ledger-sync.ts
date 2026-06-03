import { broadcastOperationalBump } from "@/lib/nexus-operational-sync-broadcast"

/** Fired when funding, withdrawals, or ledger rows change — refresh wallet + History. */
export const NEXUS_CUSTOMER_LEDGER_BUMP = "nexus-customer-ledger-bump"

export function dispatchCustomerLedgerBump(source?: string): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(NEXUS_CUSTOMER_LEDGER_BUMP, {
      detail: { source: source ?? "client", ts: Date.now() },
    }),
  )
  window.dispatchEvent(new Event("nexus-balance-snapshot-synced"))
  broadcastOperationalBump(source ?? "ledger")
}
