/**
 * Customer-facing notification copy and sanitization.
 * Operational / treasury / accounting detail belongs in admin logs and metadata.ops_audit — never in title/body.
 */

const INTERNAL_PHRASE =
  /normalized settlement|MAIN_TREASURY|OPERATIONAL(?:\s+pool)?|admin_airtel(?:_ug)?|admin[\s_-]*direct|admin_crypto|L5\s+approved|treasury[\s_-]*pool|retailer_retail_balance|fx[\s_-]*(snapshot|normalization|middleware)|funding_request_admin|legacy_admin|official[\s_-]*corridor|book entry|nexus_main_pending|→|debited|credited account|liquidity reservation|settlement trace|middleware_version|usd_native_v1|internal_daily_fx/i

function formatLocalAmount(amount: number, currency: string): string {
  const ccy = currency.trim().toUpperCase()
  const frac = ccy === "UGX" || ccy === "TZS" || ccy === "RWF" || ccy === "MWK" ? 0 : 2
  return `${ccy} ${amount.toLocaleString(undefined, { maximumFractionDigits: frac, minimumFractionDigits: frac === 0 ? 0 : 2 })}`
}

/** Strip or replace text that leaks backend mechanics into customer UI. */
export function sanitizeCustomerNotificationText(text: string, fallback: string): string {
  const t = text.trim()
  if (!t) return fallback
  if (INTERNAL_PHRASE.test(t)) return fallback
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
      body: `Your funding request of ${localFmt} has been approved and credited to your Nexus Main balance.`,
      customerHint: "Funds have been successfully credited to your account.",
    }
  }
  const usd = Number(params.amountUsd ?? NaN)
  if (Number.isFinite(usd) && usd > 0) {
    return {
      title: "Funding approved",
      body: `Your funding of $${usd.toFixed(2)} has been approved and credited to your Nexus Main balance.`,
      customerHint: "Funds have been successfully credited to your account.",
    }
  }
  return {
    title: "Funding approved",
    body: "Your funding request has been approved and credited to your Nexus Main balance.",
    customerHint: "Funds have been successfully credited to your account.",
  }
}

export function buildFundingRejectedCustomerCopy(note?: string | null): { title: string; body: string } {
  const cleanNote = note?.trim()
  if (cleanNote && !INTERNAL_PHRASE.test(cleanNote) && cleanNote.length <= 120) {
    return {
      title: "Funding request declined",
      body: `Your funding request was not approved. ${cleanNote}`,
    }
  }
  return {
    title: "Funding request declined",
    body: "Your funding request was not approved. Contact support if you need help.",
  }
}

export function buildFundingHeldCustomerCopy(note?: string | null): { title: string; body: string } {
  const cleanNote = note?.trim()
  if (cleanNote && !INTERNAL_PHRASE.test(cleanNote) && cleanNote.length <= 120) {
    return {
      title: "Funding under review",
      body: `Your funding request is being reviewed. ${cleanNote}`,
    }
  }
  return {
    title: "Funding under review",
    body: "Your funding request is being reviewed. We will notify you when it is approved or declined.",
  }
}

export function buildFundingResolvedCustomerCopy(): { title: string; body: string } {
  return {
    title: "Funding request closed",
    body: "Your funding request has been closed. Contact support if you have questions.",
  }
}

export function buildFundingSubmittedCustomerCopy(): { title: string; body: string } {
  return {
    title: "Funding submitted",
    body: "We received your funding request and will notify you when it is reviewed.",
  }
}

/** Short headline for legacy NotificationRecord inbox rows. */
export function buildFundingStatusHeadline(status: string, note?: string | null): string {
  if (status === "approved") return "Funding approved"
  if (status === "rejected") return "Funding request declined"
  if (status === "under_review") return "Funding under review"
  if (status === "resolved") return "Funding request closed"
  return sanitizeCustomerNotificationText(status, "Funding update")
}
