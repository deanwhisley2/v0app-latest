/**
 * Smoke test for declined withdrawal history presentation.
 * Run: npx tsx scripts/test-withdrawal-history-presenter.ts
 */
import {
  buildWithdrawalHistoryIndex,
  isWithdrawalDeclinedStatus,
  presentWithdrawalHistoryRow,
  shouldSuppressWithdrawalLedgerEvent,
} from "../lib/transactions/withdrawal-history-presenter"
import { presentFinancialEventForCustomer } from "../lib/notifications/financial-event-presenter"

const mockDeclined: Parameters<typeof presentWithdrawalHistoryRow>[0] = {
  id: "req-test-1",
  amount: 50,
  status: "rejected",
  transaction_ref: "WD-TEST-REF-001",
  created_at: "2026-06-09T10:00:00.000Z",
  reviewed_at: "2026-06-09T10:01:00.000Z",
  resolution_note: "Participation rule: dual-session history required before withdrawal.",
}

const t = (key: string) =>
  ({
    "receipt.timeline.withdrawalRejected": "Withdrawal Declined",
    "receipt.status.failedRefunded": "Failed & Refunded",
    "receipt.category.withdrawal": "Withdrawal",
  })[key] ?? key

const formatMoney = (n: number) => `$${n.toFixed(2)}`

const presented = presentWithdrawalHistoryRow(mockDeclined, formatMoney, t)
console.assert(isWithdrawalDeclinedStatus("rejected"), "rejected is declined")
console.assert(presented.declined === true, "declined flag")
console.assert(presented.titleKey === "receipt.timeline.withdrawalRejected", "title key")
console.assert(presented.subtitle.includes("Failed & Refunded"), "subtitle status")
console.assert(presented.declineReason?.includes("dual-session"), "decline reason")

const index = buildWithdrawalHistoryIndex([mockDeclined])
const pendingEvent = {
  event_type: "withdrawal_pending",
  metadata: { requestId: "req-test-1" },
  transaction_ref: "WD-TEST-REF-001",
}
const refundEvent = {
  event_type: "withdrawal_rejected_refund",
  metadata: { requestId: "req-test-1" },
  transaction_ref: "WD-TEST-REF-001",
}
console.assert(
  shouldSuppressWithdrawalLedgerEvent(pendingEvent, index),
  "suppress pending mirror",
)
console.assert(
  shouldSuppressWithdrawalLedgerEvent(refundEvent, index),
  "suppress refund mirror",
)

const refundPresented = presentFinancialEventForCustomer(
  {
    summary: "Withdrawal rejected — gross returned to Nexus Main.",
    event_type: "withdrawal_rejected_refund",
    category: "cashout",
    status: "completed",
    gross_amount: 50,
  },
  undefined,
)
console.assert(refundPresented.title === "Withdrawal Declined", "event title")
console.assert(refundPresented.detailLine.includes("Failed & Refunded"), "event detail")

console.log("PASS — withdrawal history presenter smoke tests")
