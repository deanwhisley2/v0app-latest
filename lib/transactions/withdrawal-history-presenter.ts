import {
  resolveWithdrawalStatusKeys,
  type WithdrawalReceiptRow,
} from "@/lib/transactions/transaction-receipt-model"

/** Ledger statuses that mean the withdrawal was declined by ops. */
export function isWithdrawalDeclinedStatus(status: string): boolean {
  const s = String(status ?? "").toLowerCase()
  return s === "rejected" || s === "declined"
}

const WITHDRAWAL_LEDGER_EVENT_TYPES = new Set([
  "withdrawal_pending",
  "withdrawal_rejected_refund",
  "withdrawal_approved_master_recycle",
  "withdrawal_operations_hold",
  "withdrawal_approval_reverted",
])

export function isWithdrawalLedgerEventType(eventType: string): boolean {
  return WITHDRAWAL_LEDGER_EVENT_TYPES.has(String(eventType ?? "").toLowerCase())
}

function metaRequestId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  const id = (metadata as Record<string, unknown>).requestId
  return typeof id === "string" && id.trim() ? id.trim() : null
}

export function buildWithdrawalHistoryIndex(rows: WithdrawalReceiptRow[]): {
  ids: Set<string>
  refs: Set<string>
} {
  const ids = new Set<string>()
  const refs = new Set<string>()
  for (const row of rows) {
    if (row.id) ids.add(row.id)
    const ref = String(row.transaction_ref ?? "").trim()
    if (ref) refs.add(ref)
  }
  return { ids, refs }
}

/** Suppress ledger mirror rows when the canonical withdrawal_requests row is already in history. */
export function shouldSuppressWithdrawalLedgerEvent(
  event: {
    event_type: string
    metadata?: unknown
    transaction_ref?: string | null
  },
  index: { ids: Set<string>; refs: Set<string> },
): boolean {
  if (!isWithdrawalLedgerEventType(event.event_type)) return false
  const rid = metaRequestId(event.metadata)
  if (rid && index.ids.has(rid)) return true
  const ref = typeof event.transaction_ref === "string" ? event.transaction_ref.trim() : ""
  if (ref && index.refs.has(ref)) return true
  return false
}

export function withdrawalRequestIdFromNotification(item: {
  receiptSourceKind?: string
  receiptSourceId?: string
  accountNotificationType?: string
  title?: string
  message?: string
}): string | null {
  const sk = String(item.receiptSourceKind ?? "").toLowerCase()
  const sid = String(item.receiptSourceId ?? "").trim()
  if (sk === "withdrawal_request" && sid) return sid
  if (sk === "withdrawal_status" && sid) return sid.replace(/:rejected$/i, "")
  const nt = String(item.accountNotificationType ?? "").toLowerCase()
  if (nt.includes("withdrawal") && sid && !sid.includes(":")) return sid
  return null
}

export function shouldSuppressWithdrawalNotification(
  item: {
    receiptSourceKind?: string
    receiptSourceId?: string
    accountNotificationType?: string
    title?: string
    message?: string
  },
  index: { ids: Set<string> },
): boolean {
  const blob = `${item.title ?? ""} ${item.message ?? ""}`.toLowerCase()
  const nt = String(item.accountNotificationType ?? "").toLowerCase()
  const isWithdrawal =
    nt.includes("withdrawal") ||
    String(item.receiptSourceKind ?? "").toLowerCase().includes("withdrawal") ||
    /withdraw/i.test(blob)
  if (!isWithdrawal) return false
  const rid = withdrawalRequestIdFromNotification(item)
  return Boolean(rid && index.ids.has(rid))
}

export type WithdrawalHistoryPresentation = {
  titleKey: string
  statusLabelKey: string
  declined: boolean
  declineReason: string | null
  subtitle: string
}

export function presentWithdrawalHistoryRow(
  row: WithdrawalReceiptRow,
  formatMoney: (amount: number) => string,
  t: (key: string) => string,
): WithdrawalHistoryPresentation {
  const keys = resolveWithdrawalStatusKeys(row)
  const declined = isWithdrawalDeclinedStatus(row.status)
  const note = typeof row.resolution_note === "string" ? row.resolution_note.trim() : ""
  const declineReason = declined && note ? note : null
  const amount = formatMoney(Number(row.amount))
  const statusLabel = t(keys.statusLabelKey)
  return {
    titleKey: keys.timelineLabelKey,
    statusLabelKey: keys.statusLabelKey,
    declined,
    declineReason,
    subtitle: `${amount} · ${t("receipt.category.withdrawal")} · ${statusLabel}`,
  }
}
