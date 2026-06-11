import {
  buildFundsCreditedCustomerCopy,
  buildFundingApprovedCustomerCopy,
  buildFundingHeldCustomerCopy,
  buildFundingRejectedCustomerCopy,
  buildFundingSubmittedCustomerCopy,
  buildWithdrawalRejectedCustomerCopy,
  isInternalNotificationCopy,
} from "@/lib/notifications/customer-notification-language"
import { formatMoneyAmount } from "@/lib/currency-display"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import type { AppLanguage } from "@/lib/user-preferences"

export type MappedCustomerNotification = {
  title: string
  body: string
}

function clean(s: string): string {
  return s.replace(/\s{2,}/g, " ").trim()
}

function blob(title: string, body: string): string {
  return `${title} ${body}`.toLowerCase()
}

function formatCustomerAmountUsd(
  amountUsd: number,
  viewer?: {
    fundingCountryCode?: string | null
    preferredCurrency?: string | null
    locale?: string
  },
): string {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return ""
  const currency = displayCurrencyForCustomer(
    viewer?.fundingCountryCode ?? null,
    viewer?.preferredCurrency ?? null,
  )
  const locale = viewer?.locale ?? "en-US"
  return formatMoneyAmount(amountUsd, currency, locale)
}

/**
 * Central customer notification mapper.
 * Converts internal notification_type + stored title/body into calm, premium customer copy.
 * Never mention desks, treasury, ledger, Nexus Main attribution, gross commit, etc.
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
    language?: AppLanguage
  }
}): MappedCustomerNotification | null {
  const t = (params.notificationType ?? "").toLowerCase().trim()
  const rawTitle = params.title ?? ""
  const rawBody = params.body ?? ""
  const combined = blob(rawTitle, rawBody)
  const meta =
    params.metadata && typeof params.metadata === "object" && params.metadata !== null
      ? (params.metadata as Record<string, unknown>)
      : null

  const amountUsd = Number(meta?.amount_usd ?? meta?.settled_amount_usd ?? NaN)
  const amountInputLocal = Number(meta?.amount_input_local ?? NaN)
  const inputCurrency = typeof meta?.input_currency === "string" ? meta.input_currency : null
  const viewer = params.viewer
  const amountFmt =
    Number.isFinite(amountUsd) && amountUsd > 0 ? formatCustomerAmountUsd(amountUsd, viewer) : ""

  if (isInternalNotificationCopy(rawTitle) || isInternalNotificationCopy(rawBody)) {
    const mapped = mapInternalOpsNotification(combined, {
      amountUsd,
      amountInputLocal,
      inputCurrency,
      viewer,
    })
    if (mapped) return mapped
  }

  // --- Security / login ---
  if (
    t.includes("security") ||
    /sign[- ]?in|login detected|new login|account access/i.test(combined)
  ) {
    return {
      title: "New login detected",
      body: "A new sign-in was recorded on your account. If this was not you, open Security & Recovery.",
    }
  }

  // --- Referral / launch bonus ---
  if (
    t.includes("referral") ||
    t.includes("launch") ||
    t.includes("bonus") ||
    /first deposit bonus|referral reward|bonus credited|startup capital/i.test(combined)
  ) {
    if (/referral.*join|new referral/i.test(combined)) {
      return {
        title: "New referral",
        body: "Someone registered with your referral link. Rewards apply after they fund and trade.",
      }
    }
    const bonusBody = amountFmt
      ? `A promotional bonus of ${amountFmt} has been credited to your account.`
      : "A promotional bonus has been credited to your account."
    if (/20%|first deposit|referee|welcome bonus/i.test(combined)) {
      return { title: "Bonus credited", body: bonusBody }
    }
    if (/welcome/i.test(combined)) {
      return {
        title: "Welcome",
        body: "Your account is active. Add funds to start trading when you are ready.",
      }
    }
    return { title: "Bonus credited", body: bonusBody }
  }

  // --- Withdrawals ---
  if (t.includes("withdrawal") || /withdraw/i.test(combined)) {
    if (t.includes("approved") || /approved|processed|sent|completed/i.test(combined)) {
      return {
        title: "Withdrawal approved",
        body: amountFmt
          ? `Your withdrawal of ${amountFmt} has been approved and is being sent to your payout method.`
          : "Your withdrawal request has been approved and is being processed.",
      }
    }
    if (t.includes("rejected") || t.includes("declined") || /declined|failed|rejected/i.test(combined)) {
      const note =
        typeof meta?.resolution_note === "string"
          ? meta.resolution_note
          : typeof meta?.note === "string"
            ? meta.note
            : null
      const copy = buildWithdrawalRejectedCustomerCopy(note)
      return { title: clean(copy.title), body: clean(copy.body) }
    }
    return {
      title: "Withdrawal received",
      body: amountFmt
        ? `We received your withdrawal request for ${amountFmt}. You will be notified when it is processed.`
        : "We received your withdrawal request. You will be notified when it is processed.",
    }
  }

  // --- Crypto deposits ---
  if (t.includes("crypto")) {
    if (t.includes("credited") || /credited|confirmed/i.test(combined)) {
      return {
        title: "Deposit credited",
        body: amountFmt
          ? `Your crypto deposit of ${amountFmt} has been credited to your balance.`
          : "Your crypto deposit has been credited to your balance.",
      }
    }
    return {
      title: "Deposit received",
      body: amountFmt
        ? `Your crypto deposit of ${amountFmt} is being confirmed.`
        : "Your crypto deposit is being confirmed.",
    }
  }

  // --- Funding / add funds (mobile money, retailer path, L5 ops) ---
  if (
    t.includes("funding") ||
    t.includes("retailer_fund") ||
    t.includes("l5_funding") ||
    /add[- ]?funds|deposit|mobile[- ]?money|retailer approved|local funding/i.test(combined)
  ) {
    if (
      t.includes("approved") ||
      t.includes("credited") ||
      /approved|credited|settled|successfully credited/i.test(combined)
    ) {
      const copy = buildFundingApprovedCustomerCopy(
        {
          amountUsd: Number.isFinite(amountUsd) ? amountUsd : null,
          amountInputLocal: Number.isFinite(amountInputLocal) ? amountInputLocal : null,
          inputCurrency,
          fundingCountryCode: viewer?.fundingCountryCode ?? null,
          preferredCurrency: viewer?.preferredCurrency ?? null,
          locale: viewer?.locale,
          language: viewer?.language,
        },
      )
      return { title: clean(copy.title), body: clean(copy.body) }
    }
    if (t.includes("held") || t.includes("review") || /under review|awaiting.*verification|pending review/i.test(combined)) {
      const copy = buildFundingHeldCustomerCopy(typeof meta?.note === "string" ? meta.note : null)
      return { title: clean(copy.title), body: clean(copy.body) }
    }
    if (t.includes("rejected") || t.includes("declined") || /declined|rejected|failed/i.test(combined)) {
      const copy = buildFundingRejectedCustomerCopy(typeof meta?.note === "string" ? meta.note : null)
      return { title: clean(copy.title), body: clean(copy.body) }
    }
    if (t.includes("submitted") || t.includes("requested") || /submitted|awaiting retailer/i.test(combined)) {
      const copy = buildFundingSubmittedCustomerCopy()
      return { title: clean(copy.title), body: clean(copy.body) }
    }
  }

  // --- Trading: copy trade, fixed trade, earnings release ---
  if (
    t.includes("copy") ||
    t.includes("fixed") ||
    t.includes("trade") ||
    t.includes("container") ||
    /earnings|profit|matured|settled|bullish|principal locked|liquid earnings|copy[- ]?trade settlement|session has ended/i.test(
      combined,
    )
  ) {
    if (/copy[- ]?trade|copy trade/i.test(combined)) {
      if (/settled|completed|finished|closed/i.test(combined)) {
        return {
          title: "Copy trade completed",
          body: amountFmt
            ? `Your copy trade session has been settled successfully. ${amountFmt} was added to your balance.`
            : "Your copy trade session has been settled successfully.",
        }
      }
      if (/started|opened|active/i.test(combined)) {
        return {
          title: "Copy trade started",
          body: "Your copy trade session is now active. Track progress on the Container screen.",
        }
      }
    }
    if (/fixed|principal locked|insurance|gross commit|active fixed session/i.test(combined)) {
      if (/finished|completed|matured|closed|session completed/i.test(combined)) {
        return {
          title: "Trade session completed",
          body: amountFmt
            ? `Your trade session has completed. ${amountFmt} is now available per your program terms.`
            : "Your trade session has completed. Funds are available per your program terms.",
        }
      }
      return {
        title: "Trade session allocation active",
        body: "Your trade session allocation is active. View progress on the trading workspace.",
      }
    }
    if (/insurance.*reserved|carved from gross|reserved from allocation/i.test(combined)) {
      return {
        title: "Trade opened",
        body: "Your trade is active. Fees and insurance are shown on the Container screen before you confirm.",
      }
    }
    if (/stake reserved|copy[- ]?trade stake/i.test(combined)) {
      return {
        title: "Copy trade started",
        body: amountFmt
          ? `Your copy trade session has started with ${amountFmt} allocated.`
          : "Your copy trade session has started.",
      }
    }

    // --- Detect session completed (new + old format) ---
    // New format: "🚀 Session Completed" / "✅ Session Completed" — body already has short summary
    // Old format: "Trade session complete" / "Session complete" — needs mapping
    const isNewFormat = /[✅🚀]\s*Session\s+Completed/i.test(rawTitle)
    const isOldFormat = (/trade\s+session\s+complete|session\s+complete/i.test(rawTitle) &&
      /release|credit|returned|capital/i.test(rawBody))

    if (isNewFormat) {
      // New format — body already has short summary, title is already formatted
      // The friendly_detail metadata has the full detail view
      return null // Return null to use stored values as-is
    }

    if (isOldFormat) {
      // Old format — generate new format from available data
      const hasEarnings = Number(meta?.amount_usd ?? 0) > 0
      const signPrefix = hasEarnings ? "🚀" : "✅"
      const amountLocal = amountFmt || ""
      const amountLine = hasEarnings && amountLocal
        ? `Capital returned: ${amountLocal}`
        : "Capital returned: —"
      const bodyLines = [
        `${signPrefix} Session Completed`,
        ``,
        amountLine,
        ``,
        "Status: Closed",
      ].filter(Boolean).join("\n")

      return {
        title: `${signPrefix} Session Completed`,
        body: bodyLines,
      }
    }

    if (/container liquid|transferred into|earnings transferred|release|added to your balance|fixed[- ]?trade earnings/i.test(combined)) {
      return {
        title: "Trade session earnings credited",
        body: amountFmt
          ? `Trade session earnings of ${amountFmt} have been credited to your balance.`
          : "Trade session earnings have been credited to your balance.",
      }
    }
    if (amountFmt) {
      return {
        title: "Trading update",
        body: `Trading earnings of ${amountFmt} have been added to your balance.`,
      }
    }
    return {
      title: "Trading update",
      body: "Your trading activity was updated. Open the Container screen for details.",
    }
  }

  // --- Retailer-only ops (customer should never see; map if leaked) ---
  if (/retailer desk|retail balance debited|on behalf of retailer|l5 approved/i.test(combined)) {
    if (/approved|credited/i.test(combined)) {
      const copy = buildFundingApprovedCustomerCopy({
        amountUsd: Number.isFinite(amountUsd) ? amountUsd : null,
        amountInputLocal: Number.isFinite(amountInputLocal) ? amountInputLocal : null,
        inputCurrency,
        fundingCountryCode: viewer?.fundingCountryCode ?? null,
        preferredCurrency: viewer?.preferredCurrency ?? null,
        locale: viewer?.locale,
        language: viewer?.language,
      })
      return { title: clean(copy.title), body: clean(copy.body) }
    }
    return {
      title: "Account update",
      body: "Your account balance was updated. Open Wallet for the latest status.",
    }
  }

  return null
}

function mapInternalOpsNotification(
  combined: string,
  ctx: {
    amountUsd: number
    amountInputLocal: number
    inputCurrency: string | null
    viewer?: {
      fundingCountryCode?: string | null
      preferredCurrency?: string | null
      locale?: string
      language?: AppLanguage
    }
  },
): MappedCustomerNotification | null {
  const { amountUsd, amountInputLocal, inputCurrency, viewer } = ctx
  const amountFmt =
    Number.isFinite(amountUsd) && amountUsd > 0 ? formatCustomerAmountUsd(amountUsd, viewer) : ""

  if (/launch promotion|first.deposit bonus|referral reward/i.test(combined)) {
    return {
      title: "Bonus credited",
      body: amountFmt
        ? `A promotional bonus of ${amountFmt} has been credited to your account.`
        : "A promotional bonus has been credited to your account.",
    }
  }
  if (/approved|credited|settled|retailer approved/i.test(combined)) {
    const copy = buildFundingApprovedCustomerCopy({
      amountUsd: Number.isFinite(amountUsd) ? amountUsd : null,
      amountInputLocal: Number.isFinite(amountInputLocal) ? amountInputLocal : null,
      inputCurrency,
      fundingCountryCode: viewer?.fundingCountryCode ?? null,
      preferredCurrency: viewer?.preferredCurrency ?? null,
      locale: viewer?.locale,
      language: viewer?.language,
    })
    return { title: clean(copy.title), body: clean(copy.body) }
  }
  if (/under review|awaiting|pending review|submitted/i.test(combined)) {
    const copy = buildFundingSubmittedCustomerCopy()
    return { title: clean(copy.title), body: clean(copy.body) }
  }
  if (/withdraw/i.test(combined) && /approved/i.test(combined)) {
    return { title: "Withdrawal approved", body: "Your withdrawal request has been approved." }
  }
  if (/withdraw/i.test(combined) && /reject|declin|failed|refund/i.test(combined)) {
    return {
      title: "Withdrawal Declined",
      body: "Your withdrawal was declined and funds were returned to your balance.",
    }
  }
  if (/withdraw/i.test(combined)) {
    return { title: "Withdrawal received", body: "We received your withdrawal request." }
  }
  if (/copy[- ]?trade|settlement|stake reserved/i.test(combined)) {
    return {
      title: /started|reserved|stake/i.test(combined) ? "Copy trade started" : "Copy trade completed",
      body:
        /started|reserved|stake/i.test(combined)
          ? "Your copy trade session is active."
          : "Your copy trade session has been settled successfully.",
    }
  }
  if (/insurance|gross commit|principal locked|fixed session/i.test(combined)) {
    return {
      title: /locked|reserved|open|allocation active/i.test(combined)
        ? "Trade session allocation active"
        : "Trade session completed",
      body: "Your trade session was updated. See the trading workspace for details.",
    }
  }
  if (/container liquid|earnings transferred|internal_transfer|withdrawable_to_main/i.test(combined)) {
    return {
      title: "Trade session earnings credited",
      body: amountFmt
        ? `Trade session earnings of ${amountFmt} have been credited to your balance.`
        : "Trade session earnings have been credited to your balance.",
    }
  }
  if (/login|sign[- ]?in/i.test(combined)) {
    return { title: "New login detected", body: "A new sign-in was recorded on your account." }
  }
  return { title: "Account update", body: "Your account was updated." }
}
