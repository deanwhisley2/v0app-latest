/**
 * Customer-facing notification copy and sanitization.
 * Operational / treasury / accounting detail belongs in admin logs and metadata.ops_audit — never in title/body.
 */

const INTERNAL_PHRASE =
  /normalized settlement|MAIN_TREASURY|OPERATIONAL(?:\s+pool)?|admin_airtel(?:_ug)?|admin[\s_-]*direct|admin_crypto|L5\s+approved|treasury[\s_-]*pool|retailer_retail_balance|fx[\s_-]*(snapshot|normalization|middleware)|funding_request_admin|legacy_admin|official[\s_-]*corridor|book entry|nexus_main_pending|→|debited|credited account|liquidity reservation|settlement trace|middleware_version|usd_native_v1|internal_daily_fx|internal unit|standard dollar|we convert|at today.?s rate|≈\s*USD|USD equivalent|settlement|normalization|ledger|middleware|lifecycle|processor|routing|rpc\b/i

const CONVERSATIONAL_PHRASE =
  /\b(we|we're|we've|our team|our system|we set aside|we took|we will|we are|we received|we kept|we verify|we credit|we'd|you can|you may|let us|please wait while|something went wrong while|we could not|i'm here|get started with)\b/i

function formatLocalAmount(amount: number, currency: string): string {
  const ccy = currency.trim().toUpperCase()
  const frac = ccy === "UGX" || ccy === "TZS" || ccy === "RWF" || ccy === "MWK" ? 0 : 2
  return `${ccy} ${amount.toLocaleString(undefined, { maximumFractionDigits: frac, minimumFractionDigits: frac === 0 ? 0 : 2 })}`
}

/** Strip or replace text that leaks backend mechanics into customer UI. */
const RAW_LOGIN_BODY =
  /new\s+login|login\s+detected|sign[- ]?in\s+detected/i

/** Raw IP + user-agent blobs belong in metadata, not headline copy. */
const IP_UA_BLOB =
  /\b\d{1,3}(?:\.\d{1,3}){3}\b.*(?:webkit|chrome|safari|firefox|edge)/i

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
  /** Optional secondary line in notification center (never operational). */
  customerHint: string
}

export function buildFundingApprovedCustomerCopy(params: {
  amountInputLocal?: number | null
  inputCurrency?: string | null
  amountUsd?: number | null
}): FundingApprovedCustomerCopy {
  const ccy = String(params.inputCurrency ?? "")
    .trim()
    .toUpperCase()
  const local = Number(params.amountInputLocal ?? NaN)
  if (ccy.length >= 3 && Number.isFinite(local) && local > 0) {
    const localFmt = formatLocalAmount(local, ccy)
    return {
      title: "Funding approved",
      body: `Approved · ${localFmt}. Credited.`,
      customerHint: "Credited.",
    }
  }
  return {
    title: "Funding approved",
    body: "Approved. Credited.",
    customerHint: "Credited.",
  }
}

export function buildFundingRejectedCustomerCopy(note?: string | null): { title: string; body: string } {
  const cleanNote = note?.trim()
  if (cleanNote && !INTERNAL_PHRASE.test(cleanNote) && cleanNote.length <= 120) {
    return {
      title: "Funding declined",
      body: `Funding declined. ${cleanNote}`,
    }
  }
  return {
    title: "Funding request declined",
    body: "Rejected.",
  }
}

export function buildFundingHeldCustomerCopy(note?: string | null): { title: string; body: string } {
  const cleanNote = note?.trim()
  if (cleanNote && !INTERNAL_PHRASE.test(cleanNote) && cleanNote.length <= 120) {
    return {
      title: "Funding under review",
      body: `Request under review. ${cleanNote}`,
    }
  }
  return {
    title: "Funding under review",
    body: "Under review.",
  }
}

export function buildFundingResolvedCustomerCopy(): { title: string; body: string } {
  return {
    title: "Funding request closed",
    body: "Funding request closed.",
  }
}

export function buildFundingSubmittedCustomerCopy(): { title: string; body: string } {
  return {
    title: "Funding submitted",
    body: "Submitted.",
  }
}

/** Short headline for legacy NotificationRecord inbox rows. */
export function buildFundingStatusHeadline(status: string, note?: string | null): string {
  if (status === "approved") return "Funding approved"
  if (status === "rejected") return "Funding request rejected"
  if (status === "under_review") return "Funding under review"
  if (status === "resolved") return "Funding request closed"
  return sanitizeCustomerNotificationText(status, "Funding update")
}
