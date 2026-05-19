/**
 * Customer-facing notification copy and sanitization.
 * Operational / treasury / accounting detail belongs in admin logs and metadata.ops_audit — never in title/body.
 */

const INTERNAL_PHRASE =
  /normalized settlement|MAIN_TREASURY|OPERATIONAL(?:\s+pool)?|admin_airtel(?:_ug)?|admin[\s_-]*direct|admin_crypto|L5\s+approved|treasury[\s_-]*pool|retailer_retail_balance|fx[\s_-]*(snapshot|normalization|middleware)|funding_request_admin|legacy_admin|official[\s_-]*corridor|book entry|nexus_main_pending|→|debited|credited account|liquidity reservation|settlement trace|middleware_version|usd_native_v1|internal_daily_fx|internal unit|standard dollar|we convert|at today.?s rate|≈\s*USD|USD equivalent|settlement|normalization|ledger|middleware|lifecycle|processor|routing|rpc\b/i

const CONVERSATIONAL_PHRASE =
  /\b(we|we're|we've|our team|our system|we set aside|we took|we will|we are|we received|we kept|we verify|we credit|we'd|you can|you may|let us|please wait while|something went wrong while|we could not|i'm here|get started with)\b/i

/** Raw IP + user-agent blobs belong in metadata, not headline copy. */
const RAW_LOGIN_BODY =
  /new\s+login|login\s+detected|sign[- ]?in\s+detected/i

const IP_UA_BLOB =
  /\b\d{1,3}(?:\.\d{1,3}){3}\b.*(?:webkit|chrome|safari|firefox|edge)/i

export type NotifyCopyFn = (key: string) => string

function formatLocalAmount(amount: number, currency: string, locale?: string): string {
  const ccy = currency.trim().toUpperCase()
  const frac = ccy === "UGX" || ccy === "TZS" || ccy === "RWF" || ccy === "MWK" ? 0 : 2
  return `${ccy} ${amount.toLocaleString(locale ?? undefined, { maximumFractionDigits: frac, minimumFractionDigits: frac === 0 ? 0 : 2 })}`
}

export function sanitizeCustomerNotificationText(text: string, fallback: string): string {
  const t = text.trim()
  if (!t) return fallback
  if (INTERNAL_PHRASE.test(t)) return fallback
  if (CONVERSATIONAL_PHRASE.test(t)) return fallback
  if (RAW_LOGIN_BODY.test(t) || IP_UA_BLOB.test(t)) return fallback
  if (/_[a-z]{2,}/.test(t) && /admin|treasury|corridor|settlement|normalized/i.test(t)) return fallback
  return t
}

export type FundingApprovedCustomerCopy = {
  title: string
  body: string
  customerHint: string
}

export function buildFundingApprovedCustomerCopy(
  params: {
    amountInputLocal?: number | null
    inputCurrency?: string | null
    amountUsd?: number | null
  },
  t?: NotifyCopyFn,
): FundingApprovedCustomerCopy {
  const tr =
    t ??
    ((key: string) => {
      const en: Record<string, string> = {
        "notifications.customer.fundingApprovedTitle": "Funding approved",
        "notifications.customer.fundingApprovedBody": "Approved. Credited.",
        "notifications.customer.fundingApprovedBodyLocal": "Approved · {{amount}}. Credited.",
        "notifications.customer.fundingApprovedHint": "Credited.",
      }
      return en[key] ?? key
    })

  const ccy = String(params.inputCurrency ?? "")
    .trim()
    .toUpperCase()
  const local = Number(params.amountInputLocal ?? NaN)
  if (ccy.length >= 3 && Number.isFinite(local) && local > 0) {
    const localFmt = formatLocalAmount(local, ccy)
    return {
      title: tr("notifications.customer.fundingApprovedTitle"),
      body: tr("notifications.customer.fundingApprovedBodyLocal").replace("{{amount}}", localFmt),
      customerHint: tr("notifications.customer.fundingApprovedHint"),
    }
  }
  return {
    title: tr("notifications.customer.fundingApprovedTitle"),
    body: tr("notifications.customer.fundingApprovedBody"),
    customerHint: tr("notifications.customer.fundingApprovedHint"),
  }
}

export function buildFundingRejectedCustomerCopy(
  note?: string | null,
  t?: NotifyCopyFn,
): { title: string; body: string } {
  const tr =
    t ??
    ((key: string) =>
      ({
        "notifications.customer.fundingDeclinedTitle": "Funding declined",
        "notifications.customer.fundingDeclinedBody": "Funding declined. {{note}}",
        "notifications.customer.fundingRejectedTitle": "Funding request declined",
        "notifications.customer.fundingRejectedBody": "Rejected.",
      })[key] ?? key)

  const cleanNote = note?.trim()
  if (cleanNote && !INTERNAL_PHRASE.test(cleanNote) && cleanNote.length <= 120) {
    return {
      title: tr("notifications.customer.fundingDeclinedTitle"),
      body: tr("notifications.customer.fundingDeclinedBody").replace("{{note}}", cleanNote),
    }
  }
  return {
    title: tr("notifications.customer.fundingRejectedTitle"),
    body: tr("notifications.customer.fundingRejectedBody"),
  }
}

export function buildFundingHeldCustomerCopy(
  note?: string | null,
  t?: NotifyCopyFn,
): { title: string; body: string } {
  const tr =
    t ??
    ((key: string) =>
      ({
        "notifications.customer.fundingHeldTitle": "Funding under review",
        "notifications.customer.fundingHeldBody": "Under review.",
        "notifications.customer.fundingHeldBodyNote": "Request under review. {{note}}",
      })[key] ?? key)

  const cleanNote = note?.trim()
  if (cleanNote && !INTERNAL_PHRASE.test(cleanNote) && cleanNote.length <= 120) {
    return {
      title: tr("notifications.customer.fundingHeldTitle"),
      body: tr("notifications.customer.fundingHeldBodyNote").replace("{{note}}", cleanNote),
    }
  }
  return {
    title: tr("notifications.customer.fundingHeldTitle"),
    body: tr("notifications.customer.fundingHeldBody"),
  }
}

export function buildFundingResolvedCustomerCopy(t?: NotifyCopyFn): { title: string; body: string } {
  const tr =
    t ??
    ((key: string) =>
      ({
        "notifications.customer.fundingResolvedTitle": "Funding request closed",
        "notifications.customer.fundingResolvedBody": "Funding request closed.",
      })[key] ?? key)
  return {
    title: tr("notifications.customer.fundingResolvedTitle"),
    body: tr("notifications.customer.fundingResolvedBody"),
  }
}

export function buildFundingSubmittedCustomerCopy(t?: NotifyCopyFn): { title: string; body: string } {
  const tr =
    t ??
    ((key: string) =>
      ({
        "notifications.customer.fundingSubmittedTitle": "Funding submitted",
        "notifications.customer.fundingSubmittedBody": "Submitted.",
      })[key] ?? key)
  return {
    title: tr("notifications.customer.fundingSubmittedTitle"),
    body: tr("notifications.customer.fundingSubmittedBody"),
  }
}

/** Short headline for legacy NotificationRecord inbox rows. */
export function buildFundingStatusHeadline(status: string, note?: string | null, t?: NotifyCopyFn): string {
  const tr =
    t ??
    ((key: string) =>
      ({
        "notifications.customer.fundingApprovedTitle": "Funding approved",
        "notifications.customer.fundingRejectedTitle": "Funding request declined",
        "notifications.customer.fundingHeldTitle": "Funding under review",
        "notifications.customer.fundingResolvedTitle": "Funding request closed",
        "notifications.customer.fundingUpdateTitle": "Funding update",
      })[key] ?? key)

  if (status === "approved") return tr("notifications.customer.fundingApprovedTitle")
  if (status === "rejected") return tr("notifications.customer.fundingRejectedTitle")
  if (status === "under_review") return tr("notifications.customer.fundingHeldTitle")
  if (status === "resolved") return tr("notifications.customer.fundingResolvedTitle")
  return sanitizeCustomerNotificationText(status, tr("notifications.customer.fundingUpdateTitle"))
}
