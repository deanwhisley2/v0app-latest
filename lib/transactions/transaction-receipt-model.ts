/**
 * Customer transaction receipt view-model (UI-only; ledger fields stay canonical English).
 */

import {
  formatUsdForCustomerDisplay,
  type CustomerMoneyContext,
} from "@/lib/customer-facing-money"
import {
  parseWithdrawalIntentFromRow,
  resolveLocalCashPayoutUsd,
} from "@/lib/formatting/withdrawal-amount-display"
import type { NexusNotificationItem } from "@/lib/nexus-notification-models"

export type ReceiptBrand = "usdt_trc20" | "mtn" | "airtel" | "mobile_money" | "nexus"
export type ReceiptKind =
  | "crypto_withdrawal"
  | "mobile_money_withdrawal"
  | "crypto_deposit"
  | "funding"
  | "trade"
  | "transfer"
  | "generic"

export type ReceiptStatusTone = "success" | "pending" | "danger" | "processing"

export type ReceiptField = {
  labelKey: string
  value: string
  mono?: boolean
  multiline?: boolean
  profitGreen?: boolean
}

export type TransactionReceipt = {
  id: string
  kind: ReceiptKind
  brand: ReceiptBrand
  statusTone: ReceiptStatusTone
  statusLabelKey: string
  headerTitleKey: string
  categoryLabelKey: string
  fields: ReceiptField[]
  timestamp: string
  reference?: string
  payoutRail?: string | null
  /** Plain-text payload for future share/download. */
  shareText: string
  /** If set, render amount as +{displayAmount} in green (#22C55E) */
  profitGreen?: { displayAmount: string }
}

export type WithdrawalReceiptRow = {
  id: string
  amount: number
  processing_fee_amount?: number | null
  payout_amount?: number | null
  processing_fee_rate?: number | null
  currency_context?: string | null
  amount_input_local?: number | null
  input_currency?: string | null
  status: string
  payout_status?: string | null
  transaction_ref: string
  created_at: string
  reviewed_at?: string | null
  resolution_note?: string | null
  metadata?: unknown
}

export type CryptoDepositReceiptRow = {
  id: string
  amount_usd: number
  status: string
  tx_hash: string
  created_at: string
  credited_at?: string | null
  on_chain_amount_usdt?: number | null
  total_credited_usd?: number | null
  credited_principal_usd?: number | null
  compensation_usd?: number | null
}

export type FinancialEventReceiptRow = {
  id: string
  event_type: string
  category: string
  gross_amount: number | null
  status: string
  summary: string | null
  transaction_ref?: string | null
  metadata?: unknown
  created_at: string
}

export type NotificationReceiptLink = {
  sourceKind?: string
  sourceId?: string
  requestId?: string
  transactionRef?: string
}

function metaObj(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {}
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtLedgerUsd(n: number, display?: CustomerMoneyContext): string {
  if (display) return formatUsdForCustomerDisplay(n, display)
  return fmtUsd(n)
}

function fmtLocal(amount: number, currency: string): string {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`
}

function resolveSettlement(row: WithdrawalReceiptRow): {
  grossAmount: number
  processingFeeAmount: number
  payoutAmount: number
} {
  const gross = Number(row.amount ?? 0)
  const payoutRaw = row.payout_amount
  const feeRaw = row.processing_fee_amount
  if (payoutRaw != null && Number.isFinite(Number(payoutRaw))) {
    const payoutAmount = Number(payoutRaw)
    const processingFeeAmount = Number(feeRaw ?? gross - payoutAmount)
    return { grossAmount: gross, processingFeeAmount, payoutAmount }
  }
  return { grossAmount: gross, processingFeeAmount: 0, payoutAmount: gross }
}

function shortRef(ref: string, head = 8, tail = 6): string {
  const s = ref.trim()
  if (s.length <= head + tail + 3) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

export function inferWithdrawalBrand(metadata: unknown): ReceiptBrand {
  const m = metaObj(metadata)
  const snap =
    m.security_profile_snapshot && typeof m.security_profile_snapshot === "object"
      ? (m.security_profile_snapshot as Record<string, unknown>)
      : null
  const rail = String(m.payout_rail ?? snap?.payout_rail ?? "").toUpperCase()
  const method = String(m.payout_method ?? "").toLowerCase()
  const network = String(m.payout_network ?? snap?.payout_network ?? "").toUpperCase()
  const option = String(m.payout_option_id ?? "").toLowerCase()

  if (rail.includes("USDT") || rail.includes("TRC20") || method.includes("crypto")) return "usdt_trc20"
  if (network === "MTN" || option.includes("mtn") || rail.includes("MTN")) return "mtn"
  if (network === "AIRTEL" || option.includes("airtel") || rail.includes("AIRTEL")) return "airtel"
  return "nexus"
}

export function inferWithdrawalKind(brand: ReceiptBrand): ReceiptKind {
  return brand === "usdt_trc20" ? "crypto_withdrawal" : "mobile_money_withdrawal"
}

export function resolveWithdrawalStatusKeys(row: WithdrawalReceiptRow): {
  tone: ReceiptStatusTone
  statusLabelKey: string
  headerTitleKey: string
  timelineLabelKey: string
} {
  const status = String(row.status ?? "").toLowerCase()
  const payoutStatus = String(row.payout_status ?? "none").toLowerCase()

  if (status === "rejected" || status === "declined") {
    return {
      tone: "danger",
      statusLabelKey: "receipt.status.failedRefunded",
      headerTitleKey: "receipt.header.withdrawalRejected",
      timelineLabelKey: "receipt.timeline.withdrawalRejected",
    }
  }
  if (status === "under_review") {
    return {
      tone: "pending",
      statusLabelKey: "receipt.status.underReview",
      headerTitleKey: "receipt.header.withdrawalUnderReview",
      timelineLabelKey: "receipt.timeline.withdrawalUnderReview",
    }
  }
  if (status === "pending") {
    return {
      tone: "pending",
      statusLabelKey: "receipt.status.pending",
      headerTitleKey: "receipt.header.withdrawalPending",
      timelineLabelKey: "receipt.timeline.withdrawalPending",
    }
  }
  if (status === "approved" && payoutStatus !== "none" && payoutStatus !== "") {
    return {
      tone: "success",
      statusLabelKey: "receipt.status.disbursed",
      headerTitleKey: "receipt.header.payoutDisbursed",
      timelineLabelKey: "receipt.timeline.withdrawalDisbursed",
    }
  }
  if (status === "approved") {
    return {
      tone: "success",
      statusLabelKey: "receipt.status.approved",
      headerTitleKey: "receipt.header.withdrawalApproved",
      timelineLabelKey: "receipt.timeline.withdrawalApproved",
    }
  }
  return {
    tone: "processing",
    statusLabelKey: "receipt.status.processing",
    headerTitleKey: "receipt.header.withdrawalProcessing",
    timelineLabelKey: "receipt.timeline.withdrawalProcessing",
  }
}

export function buildWithdrawalReceipt(
  row: WithdrawalReceiptRow,
  display?: CustomerMoneyContext,
): TransactionReceipt {
  const brand = inferWithdrawalBrand(row.metadata)
  const kind = inferWithdrawalKind(brand)
  const status = String(row.status ?? "").toLowerCase()
  const statusKeys = resolveWithdrawalStatusKeys(row)
  const settlement = resolveSettlement(row)
  const m = metaObj(row.metadata)
  const intent = parseWithdrawalIntentFromRow(row)
  const localCash = resolveLocalCashPayoutUsd({
    amountInputLocal: intent.amountInputLocal,
    inputCurrency: intent.inputCurrency,
    grossUsd: settlement.grossAmount,
    payoutUsd: settlement.payoutAmount,
    metadata: row.metadata,
  })

  const snap =
    m.security_profile_snapshot && typeof m.security_profile_snapshot === "object"
      ? (m.security_profile_snapshot as Record<string, unknown>)
      : null
  const destCandidates = [
    m.destination_hint,
    m.payout_destination,
    snap?.destination_masked,
  ]
  let dest = ""
  for (const c of destCandidates) {
    if (typeof c === "string" && c.trim()) {
      dest = c.trim()
      break
    }
  }
  const names =
    typeof m.registered_account_names === "string"
      ? m.registered_account_names
      : typeof snap?.registered_account_names === "string"
        ? String(snap.registered_account_names)
        : ""
  const payoutRail = typeof m.payout_rail === "string" ? m.payout_rail : typeof snap?.payout_rail === "string" ? String(snap.payout_rail) : null

  const fields: ReceiptField[] = [
    { labelKey: "receipt.field.amount", value: fmtLedgerUsd(settlement.grossAmount, display) },
    {
      labelKey: "receipt.field.fee",
      value:
        settlement.processingFeeAmount > 0
          ? fmtLedgerUsd(settlement.processingFeeAmount, display)
          : "—",
    },
    { labelKey: "receipt.field.received", value: fmtLedgerUsd(settlement.payoutAmount, display) },
  ]

  if (localCash) {
    fields.push({
      labelKey: "receipt.field.localReceived",
      value: fmtLocal(localCash.amount, localCash.currency),
    })
  }

  if (brand === "usdt_trc20") {
    fields.push(
      { labelKey: "receipt.field.network", value: "USDT · TRC20" },
      {
        labelKey: "receipt.field.walletAddress",
        value: dest || "—",
        mono: true,
        multiline: true,
      },
    )
  } else {
    if (names) fields.push({ labelKey: "receipt.field.recipientName", value: names })
    fields.push({
      labelKey: "receipt.field.payoutNumber",
      value: dest || "—",
      mono: true,
    })
    const network =
      typeof m.payout_network === "string"
        ? m.payout_network
        : brand === "mtn"
          ? "MTN Mobile Money"
          : brand === "airtel"
            ? "Airtel Money"
            : "Mobile Money"
    fields.push({ labelKey: "receipt.field.network", value: network })
  }

  fields.push({
    labelKey: "receipt.field.reference",
    value: row.transaction_ref,
    mono: true,
  })

  const resolutionNote =
    typeof row.resolution_note === "string" ? row.resolution_note.trim() : ""
  if (resolutionNote && (status === "rejected" || status === "declined")) {
    fields.push({
      labelKey: "receipt.field.declineReason",
      value: resolutionNote,
      multiline: true,
    })
  }

  const shareLines = [
    statusKeys.headerTitleKey,
    `Amount: ${fmtLedgerUsd(settlement.grossAmount, display)}`,
    `Received: ${fmtLedgerUsd(settlement.payoutAmount, display)}`,
    `Ref: ${row.transaction_ref}`,
    `Date: ${row.created_at}`,
  ]

  return {
    id: row.id,
    kind,
    brand,
    statusTone: statusKeys.tone,
    statusLabelKey: statusKeys.statusLabelKey,
    headerTitleKey: statusKeys.headerTitleKey,
    categoryLabelKey:
      kind === "crypto_withdrawal" ? "receipt.category.cryptoWithdrawal" : "receipt.category.mobileWithdrawal",
    fields,
    timestamp: row.reviewed_at ?? row.created_at,
    reference: row.transaction_ref,
    payoutRail,
    shareText: shareLines.join("\n"),
  }
}

export function withdrawalTimelineLabelKey(row: WithdrawalReceiptRow): string {
  return resolveWithdrawalStatusKeys(row).timelineLabelKey
}

export function buildCryptoDepositReceipt(
  row: CryptoDepositReceiptRow,
  display?: CustomerMoneyContext,
): TransactionReceipt {
  const status = String(row.status ?? "").toLowerCase()
  let tone: ReceiptStatusTone = "processing"
  let statusLabelKey = "receipt.status.processing"
  let headerTitleKey = "receipt.header.depositProcessing"

  if (status === "failed") {
    tone = "danger"
    statusLabelKey = "receipt.status.failed"
    headerTitleKey = "receipt.header.depositFailed"
  } else if (status === "manual_review") {
    tone = "pending"
    statusLabelKey = "receipt.status.underReview"
    headerTitleKey = "receipt.header.depositUnderReview"
  } else if (status === "verified" || row.credited_at) {
    tone = "success"
    statusLabelKey = "receipt.status.credited"
    headerTitleKey = "receipt.header.fundingReceived"
  } else if (status === "pending" || status.includes("awaiting") || status === "verifying") {
    tone = "pending"
    statusLabelKey = "receipt.status.pending"
    headerTitleKey = "receipt.header.depositPending"
  }

  const credited =
    row.total_credited_usd != null && Number(row.total_credited_usd) > 0
      ? Number(row.total_credited_usd)
      : Number(row.amount_usd)

  const fields: ReceiptField[] = [
    { labelKey: "receipt.field.amount", value: fmtLedgerUsd(Number(row.amount_usd), display) },
    { labelKey: "receipt.field.received", value: fmtLedgerUsd(credited, display) },
    { labelKey: "receipt.field.network", value: "USDT · TRC20" },
    {
      labelKey: "receipt.field.txHash",
      value: row.tx_hash,
      mono: true,
      multiline: true,
    },
  ]

  if (row.on_chain_amount_usdt != null && Number(row.on_chain_amount_usdt) > 0) {
    fields.splice(1, 0, {
      labelKey: "receipt.field.onChainAmount",
      value: `${Number(row.on_chain_amount_usdt).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`,
    })
  }

  return {
    id: row.id,
    kind: "crypto_deposit",
    brand: "usdt_trc20",
    statusTone: tone,
    statusLabelKey,
    headerTitleKey,
    categoryLabelKey: "receipt.category.cryptoDeposit",
    fields,
    timestamp: row.credited_at ?? row.created_at,
    reference: shortRef(row.tx_hash, 10, 8),
    shareText: [`${headerTitleKey}`, `Amount: ${fmtLedgerUsd(Number(row.amount_usd), display)}`, `Tx: ${row.tx_hash}`].join("\n"),
  }
}

export function depositTimelineLabelKey(row: CryptoDepositReceiptRow): string {
  const status = String(row.status ?? "").toLowerCase()
  if (status === "failed") return "receipt.timeline.depositFailed"
  if (row.credited_at || status === "verified") return "receipt.timeline.fundingReceived"
  if (status === "manual_review") return "receipt.timeline.depositUnderReview"
  return "receipt.timeline.depositPending"
}

export function buildFinancialEventFallbackReceipt(
  row: FinancialEventReceiptRow,
  title: string,
  detailLine: string,
  display?: CustomerMoneyContext,
): TransactionReceipt {
  const status = String(row.status ?? "").toLowerCase()
  const tone: ReceiptStatusTone =
    status === "rejected" || status === "failed"
      ? "danger"
      : status === "pending"
        ? "pending"
        : "success"
  const amt =
    row.gross_amount != null && Number.isFinite(row.gross_amount)
      ? fmtLedgerUsd(Number(row.gross_amount), display)
      : "—"
  return {
    id: row.id,
    kind: "generic",
    brand: "nexus",
    statusTone: tone,
    statusLabelKey:
      tone === "danger" ? "receipt.status.rejected" : tone === "pending" ? "receipt.status.pending" : "receipt.status.completed",
    headerTitleKey: "receipt.header.activityRecorded",
    categoryLabelKey: "receipt.category.activity",
    fields: [
      { labelKey: "receipt.field.amount", value: amt },
      { labelKey: "receipt.field.details", value: detailLine || title },
    ],
    timestamp: row.created_at,
    shareText: [title, detailLine, amt].join("\n"),
  }
}

export function buildFinancialEventReceipt(
  row: FinancialEventReceiptRow,
  display?: CustomerMoneyContext,
): TransactionReceipt | null {
  const cat = String(row.category ?? "").toLowerCase()
  const ev = String(row.event_type ?? "").toLowerCase()
  const status = String(row.status ?? "").toLowerCase()

  if (cat === "cashout" || ev.includes("withdrawal")) {
    return null
  }

  let kind: ReceiptKind = "generic"
  let headerTitleKey = "receipt.header.activityRecorded"
  let categoryLabelKey = "receipt.category.activity"
  let tone: ReceiptStatusTone = "processing"

  if (cat === "funding" || ev.includes("deposit") || ev.includes("fund")) {
    kind = "funding"
    headerTitleKey =
      status === "completed" || status === "approved"
        ? "receipt.header.fundingReceived"
        : "receipt.header.fundingPending"
    categoryLabelKey = "receipt.category.funding"
    tone = status === "rejected" || status === "failed" ? "danger" : status === "pending" ? "pending" : "success"
  } else if (cat === "trade" || cat === "container" || ev.includes("trade") || ev.includes("profit")) {
    kind = "trade"
    headerTitleKey =
      status === "completed" ? "receipt.header.tradeSettled" : "receipt.header.tradeActivity"
    categoryLabelKey = "receipt.category.trading"
    tone = status === "pending" ? "pending" : "success"
  } else if (cat === "internal_transfer") {
    kind = "transfer"
    headerTitleKey = "receipt.header.transferCompleted"
    categoryLabelKey = "receipt.category.transfer"
    tone = "success"
  }

  const amt =
    row.gross_amount != null && Number.isFinite(row.gross_amount)
      ? fmtLedgerUsd(Number(row.gross_amount), display)
      : "—"
  const fields: ReceiptField[] = [{ labelKey: "receipt.field.amount", value: amt }]
  if (row.summary?.trim()) {
    fields.push({ labelKey: "receipt.field.details", value: row.summary.trim() })
  }

  const statusLabelKey =
    status === "rejected"
      ? "receipt.status.rejected"
      : status === "pending"
        ? "receipt.status.pending"
        : status === "completed" || status === "approved"
          ? "receipt.status.completed"
          : "receipt.status.processing"

  return {
    id: row.id,
    kind,
    brand: "nexus",
    statusTone: tone,
    statusLabelKey,
    headerTitleKey,
    categoryLabelKey,
    fields,
    timestamp: row.created_at,
    shareText: [headerTitleKey, row.summary ?? "", `Amount: ${amt}`].filter(Boolean).join("\n"),
  }
}

export function extractNotificationReceiptLink(
  n: NexusNotificationItem,
  metadata?: unknown,
): NotificationReceiptLink | null {
  const m = metaObj(metadata)
  const nt = (n.accountNotificationType ?? "").toLowerCase()
  const financial =
    n.type === "financial" ||
    nt.includes("withdrawal") ||
    nt.includes("funding") ||
    nt.includes("crypto_deposit") ||
    nt.includes("deposit")

  if (!financial) return null

  const sourceKind = n.receiptSourceKind
  const sourceId = n.receiptSourceId
  const requestId =
    typeof m.requestId === "string"
      ? m.requestId
      : sourceKind === "withdrawal_request" && sourceId
        ? sourceId
        : undefined

  return {
    sourceKind,
    sourceId,
    requestId,
    transactionRef: typeof m.transactionRef === "string" ? m.transactionRef : undefined,
  }
}

export function isFinancialReceiptNotification(n: NexusNotificationItem): boolean {
  const nt = (n.accountNotificationType ?? "").toLowerCase()
  if (n.type === "financial") return true
  return (
    nt.includes("withdrawal") ||
    nt.includes("funding") ||
    nt.includes("crypto_deposit") ||
    nt.includes("deposit") ||
    nt.includes("retailer_fund")
  )
}

export function buildNotificationFallbackReceipt(
  n: NexusNotificationItem,
  title: string,
  summary: string,
  display?: CustomerMoneyContext,
): TransactionReceipt {
  const nt = (n.accountNotificationType ?? "").toLowerCase()
  let kind: ReceiptKind = "generic"
  let brand: ReceiptBrand = "nexus"
  let headerTitleKey = "receipt.header.accountUpdate"
  let categoryLabelKey = "receipt.category.account"
  let tone: ReceiptStatusTone = "processing"

  if (nt.includes("withdrawal")) {
    kind = "crypto_withdrawal"
    brand = "usdt_trc20"
    categoryLabelKey = "receipt.category.withdrawal"
    if (/reject|declin|fail/i.test(`${n.title} ${n.message}`)) {
      tone = "danger"
      headerTitleKey = "receipt.header.withdrawalRejected"
    } else if (/approv|complet|sent|disburs/i.test(`${n.title} ${n.message}`)) {
      tone = "success"
      headerTitleKey = "receipt.header.withdrawalApproved"
    } else {
      tone = "pending"
      headerTitleKey = "receipt.header.withdrawalPending"
    }
  } else if (nt.includes("crypto_deposit") || nt.includes("deposit")) {
    kind = "crypto_deposit"
    brand = "usdt_trc20"
    categoryLabelKey = "receipt.category.cryptoDeposit"
    tone = /fail/i.test(`${n.title} ${n.message}`) ? "danger" : /credit|confirm/i.test(`${n.title} ${n.message}`) ? "success" : "pending"
    headerTitleKey =
      tone === "success" ? "receipt.header.fundingReceived" : "receipt.header.depositPending"
  } else if (nt.includes("funding")) {
    kind = "funding"
    categoryLabelKey = "receipt.category.funding"
    tone = /reject|fail/i.test(`${n.title} ${n.message}`) ? "danger" : /approv|credit|complet/i.test(`${n.title} ${n.message}`) ? "success" : "pending"
    headerTitleKey = tone === "success" ? "receipt.header.fundingReceived" : "receipt.header.fundingPending"
  } else if (/session closed|earnings credited/i.test(title)) {
    kind = "trade"
    categoryLabelKey = "receipt.category.trading"
    tone = "success"
    headerTitleKey = /session closed/i.test(title) ? "receipt.header.tradeSettled" : "receipt.header.earningsCredited"
  }

  const isEarnings = /earnings credited|earnings/i.test(title) && !/principal|return|capital/i.test(title)
  const fields: ReceiptField[] = [{ labelKey: "receipt.field.summary", value: summary }]
  if (n.customerAmountUsd != null && n.customerAmountUsd > 0) {
    fields.unshift({
      labelKey: "receipt.field.amount",
      value: fmtLedgerUsd(n.customerAmountUsd, display),
      profitGreen: isEarnings,
    })
  }

  const statusLabelKey =
    tone === "danger"
      ? "receipt.status.rejected"
      : tone === "pending"
        ? "receipt.status.pending"
        : kind === "trade"
          ? "receipt.status.completed"
          : tone === "success"
            ? "receipt.status.approved"
            : "receipt.status.processing"

  return {
    id: n.id,
    kind,
    brand,
    statusTone: tone,
    statusLabelKey,
    headerTitleKey,
    categoryLabelKey,
    fields,
    timestamp: n.timestamp,
    shareText: [title, summary, n.timestamp].join("\n"),
    profitGreen: (n as { profitGreen?: { displayAmount: string } }).profitGreen,
  }
}

export async function fetchWithdrawalForReceipt(
  requestId: string,
  token: string,
): Promise<WithdrawalReceiptRow | null> {
  const res = await fetch(`/api/user/withdrawal-requests?id=${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) return null
  const j = (await res.json()) as { request?: WithdrawalReceiptRow | null }
  return j.request ?? null
}

export async function fetchDepositForReceipt(
  depositId: string,
  token: string,
): Promise<CryptoDepositReceiptRow | null> {
  const res = await fetch(`/api/user/crypto-deposit?id=${encodeURIComponent(depositId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) return null
  const j = (await res.json()) as { deposits?: CryptoDepositReceiptRow[] }
  const row = (j.deposits ?? []).find((d) => d.id === depositId)
  return row ?? null
}
