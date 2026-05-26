import {
  buildFundsCreditedCustomerCopy,
  buildFundingApprovedCustomerCopy,
  buildFundingHeldCustomerCopy,
  buildFundingRejectedCustomerCopy,
} from "@/lib/notifications/customer-notification-language"

type MappedCustomerNotification = {
  title: string
  body: string
}

function clean(s: string): string {
  return s.replace(/\s{2,}/g, " ").trim()
}

/**
 * Central customer notification mapper.
 * Converts internal notification_type + metadata into calm, brief customer copy.
 * Never mention roles, desks, treasury, ledger, settlement, or internal ops.
 */
export function mapCustomerNotification(params: {
  notificationType: string | null
  title: string
  body: string
  metadata?: unknown
  viewer?: {
    fundingCountryCode?: string | null
    preferredCurrency?: string | null
    locale?: string
    language?: import("@/lib/user-preferences").AppLanguage
  }
}): MappedCustomerNotification | null {
  const t = (params.notificationType ?? "").toLowerCase().trim()
  const meta =
    params.metadata && typeof params.metadata === "object" && params.metadata !== null
      ? (params.metadata as Record<string, unknown>)
      : null

  const amountUsd = Number(meta?.amount_usd ?? meta?.settled_amount_usd ?? NaN)
  const amountInputLocal = Number(meta?.amount_input_local ?? NaN)
  const inputCurrency = typeof meta?.input_currency === "string" ? meta.input_currency : null

  // Funding (add funds)
  if (t.includes("funding") || t.includes("retailer_fund")) {
    if (t.includes("approved") || t.includes("credited") || /approved|credited/i.test(params.title + " " + params.body)) {
      const copy = buildFundingApprovedCustomerCopy(
        {
          amountUsd: Number.isFinite(amountUsd) ? amountUsd : null,
          amountInputLocal: Number.isFinite(amountInputLocal) ? amountInputLocal : null,
          inputCurrency: inputCurrency,
          fundingCountryCode: params.viewer?.fundingCountryCode ?? null,
          preferredCurrency: params.viewer?.preferredCurrency ?? null,
          locale: params.viewer?.locale,
          language: params.viewer?.language,
        },
      )
      return { title: clean(copy.title), body: clean(copy.body) }
    }
    if (t.includes("held") || t.includes("review")) {
      const copy = buildFundingHeldCustomerCopy(typeof meta?.note === "string" ? meta.note : null)
      return { title: clean(copy.title), body: clean(copy.body) }
    }
    if (t.includes("rejected") || t.includes("declined") || t.includes("failed")) {
      const copy = buildFundingRejectedCustomerCopy(typeof meta?.note === "string" ? meta.note : null)
      return { title: clean(copy.title), body: clean(copy.body) }
    }
    if (t.includes("submitted") || t.includes("requested")) {
      return { title: "Deposit request received", body: "We’ll notify you as soon as it’s confirmed." }
    }
  }

  // Withdrawals
  if (t.includes("withdrawal") || /withdraw/i.test(params.title + " " + params.body)) {
    if (t.includes("approved") || t.includes("processed") || t.includes("sent")) {
      return { title: "Your withdrawal has been approved", body: "Funds are being sent to your payout method." }
    }
    if (t.includes("rejected") || t.includes("declined") || t.includes("failed")) {
      return { title: "Your withdrawal was declined", body: "Please review your payout details and try again." }
    }
    return { title: "Withdrawal request received", body: "We’ll notify you when it’s processed." }
  }

  // Trading earnings / settlements
  if (
    t.includes("copy") ||
    t.includes("fixed") ||
    t.includes("trade") ||
    /earnings|profit|p\/l|matured|settled/i.test(params.title + " " + params.body)
  ) {
    if (Number.isFinite(amountUsd) && amountUsd > 0) {
      const copy = buildFundsCreditedCustomerCopy(`$${amountUsd.toFixed(2)}`)
      return { title: "Trading update", body: clean(copy.body) }
    }
    return { title: "Trading update", body: "Trading earnings were added to your balance." }
  }

  // Security sign-in detection (presenter also handles raw UA/IP; this is a fallback)
  if (t.includes("security") || /sign[- ]?in|login detected/i.test(params.title + " " + params.body)) {
    return { title: "New login detected", body: "If this wasn’t you, review Security & Recovery." }
  }

  return null
}

