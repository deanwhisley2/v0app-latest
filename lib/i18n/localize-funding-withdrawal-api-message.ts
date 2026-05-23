/**
 * Maps known English API error bodies from funding / withdrawal routes to i18n keys.
 * Unknown messages pass through (canonical English from server) — safe for dynamic DB/RPC text.
 */

const EXACT_KEY: Record<string, string> = {
  "amount and txReference are required.": "funding.apiErr.amountTxRequired",
  "retailerId is required for legacy funding.": "funding.apiErr.retailerIdLegacy",
  "officialCorridorRouteId is not valid for legacy funding.": "funding.apiErr.officialNotLegacy",
  "Either retailerId (qualified desk) or officialCorridorRouteId (official corridor) is required.":
    "funding.apiErr.deskOrOfficialRequired",
  "Choose either a retailer desk or the official corridor — not both.": "funding.apiErr.deskOrOfficialNotBoth",
  "payerDisplayName and payerPhone are required for local mobile funding.": "funding.apiErr.payerRequired",
  "Save your 2-letter funding country before submitting a local funding request.": "funding.apiErr.saveCountryFirst",
  "Ledger USD does not match server FX conversion — refresh the page and re-enter your local funding amount.":
    "funding.apiErr.fxMismatch",
  "Official corridor route not found.": "funding.apiErr.officialNotFound",
  "This official corridor route is not active.": "funding.apiErr.officialInactive",
  "Country mismatch for official corridor route.": "funding.apiErr.officialCountryMismatch",
  "Network mismatch for official corridor route.": "funding.apiErr.officialNetworkMismatch",
  "This retailer is not qualified for your corridor right now (country, network, verification, liquidity, or capacity). Refresh and pick from the current list.":
    "funding.apiErr.retailerNotQualified",
  "Retailer desk not found.": "funding.apiErr.retailerNotFound",
  "Retailer liquidity was just reserved by another request — pick another desk or a smaller amount.":
    "funding.apiErr.liquidityReserved",
  "Fund request creation failed.": "funding.apiErr.createFailed",
  "Retailer funding requests are limited to Level 1 and Level 2 accounts that are not designated retailer credit desks.":
    "funding.apiErr.gateNotAllowed",
  "Amount must be greater than 0": "withdrawal.apiErr.amountPositive",
  "Insufficient Nexus Main balance for this withdrawal.": "withdrawal.apiErr.insufficientMain",
  "Withdrawal failed": "withdrawal.apiErr.genericFailed",
  "Could not create pending funding": "funding.apiErr.createPendingFailed",
  "Fetch failed": "funding.apiErr.fetchFailed",
}

const DUPLICATE_FUNDING =
  "You already have a similar pending funding request currently under review. Wait for approval or rejection before submitting again."

const DUPLICATE_TOPUP =
  "You already have a similar pending float request under review. Wait for ops to approve or reject it before submitting another with the same amount."

EXACT_KEY[DUPLICATE_FUNDING] = "funding.apiErr.duplicatePendingFunding"
EXACT_KEY[DUPLICATE_TOPUP] = "funding.apiErr.duplicatePendingTopup"

EXACT_KEY["Transaction reference already used."] = "funding.apiErr.duplicateReference"
EXACT_KEY["Transaction reference unavailable."] = "funding.apiErr.referenceUnavailable"
EXACT_KEY["Transaction reference invalid."] = "funding.apiErr.referenceInvalid"
EXACT_KEY["Funding temporarily unavailable."] = "funding.apiErr.fundingCooldown"

const MIN_WITHDRAW_RE =
  /^Minimum withdrawal is ([\d.]+) USD \(normalized internal unit\)\.$/

const MIN_WITHDRAW_ABOUT_RE =
  /^Minimum withdrawal is about ([\d.]+) USD in internal units \(20,000 UGX equivalent at current FX\)\.$/

const MIN_WITHDRAW_LOCAL_RE = /^Minimum withdrawal is (.+)\.$/

const WITHDRAW_COOLDOWN_RE =
  /^(?:You can submit one withdrawal every 24 hours\. Next withdrawal is available after|Withdrawal limit: one per 24 hours\. Next window:) (.+)\.$/

const WITHDRAW_MAX_BALANCE_RE =
  /^Withdrawal amount exceeds your withdrawable Nexus Main balance \(about ([^)]+)\)\.$/

export function localizeFundingWithdrawalApiMessage(
  raw: string | undefined | null,
  t: (key: string) => string,
): string {
  if (raw == null) return t("withdrawal.apiErr.genericFailed")
  const s = String(raw).trim()
  if (!s) return t("withdrawal.apiErr.genericFailed")
  const key = EXACT_KEY[s]
  if (key) return t(key)
  const mLocal = s.match(MIN_WITHDRAW_LOCAL_RE)
  if (mLocal) return t("withdrawal.apiErr.minimumUsd").replace("{{min}}", mLocal[1])
  const mAbout = s.match(MIN_WITHDRAW_ABOUT_RE)
  if (mAbout) return t("withdrawal.apiErr.minimumUsd").replace("{{min}}", mAbout[1])
  const m = s.match(MIN_WITHDRAW_RE)
  if (m) return t("withdrawal.apiErr.minimumUsd").replace("{{min}}", m[1])
  const mCd = s.match(WITHDRAW_COOLDOWN_RE)
  if (mCd) {
    const iso = mCd[1]
    const when = new Date(iso)
    const human = Number.isFinite(when.getTime())
      ? when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : iso
    return t("withdrawal.apiErr.cooldownNext").replace("{{when}}", human)
  }
  const mMax = s.match(WITHDRAW_MAX_BALANCE_RE)
  if (mMax) return t("withdrawal.apiErr.maxHalfBalance").replace("{{max}}", mMax[1])
  return s
}
