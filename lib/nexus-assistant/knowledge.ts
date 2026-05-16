/**
 * Customer-facing assistant knowledge — short, institutional. No internal formulas or treasury detail.
 */

export const NEXUS_PRODUCT_NAME = "Nexus PRO"

export const CONTAINER_WITHDRAWAL_SUMMARY =
  "Earnings release to pocket when available. Principal locked until maturity or early exit. Pocket withdrawal cap: 50% of liquid total per request."

export function containerCustomerEarningsStory(): string {
  return [
    "Container: lock funds with selected trader for fixed term.",
    "Earnings accrue on schedule — live Container screen is authoritative.",
    "Withdrawal milestones open per on-screen labels.",
  ].join("\n")
}

export function containerReturnFormulaLine(): string {
  return containerCustomerEarningsStory()
}

export const LEVEL_HINT = "Features match account tier shown in app."

export const NEXUS_FUNDING_AND_RETAIL_DESK_HINT = [
  "Add Funds: Crypto (USDT TRC20) or local mobile-money desk.",
  "Submit payment reference after transfer. Status in Notifications.",
  "Appeal available from funding history if needed.",
  "Desk liquidity and approvals shown in-app only.",
].join("\n")

export const CONTAINER_ILLUSTRATIVE_MICRO_USD30 =
  "Illustrative only (not guaranteed): ~$6–9 / 1 mo, ~$20–28 / 3 mo, ~$42–58 / 6 mo on ~$30 — see Container screen."

export const NEXUS_WALLET_AND_WITHDRAWAL_RULES = [
  "Main balance: deposits, trade funding, transfers.",
  "Withdrawal: amount reserved until approved or returned.",
  "Minimums and limits shown in Wallet before submit.",
].join("\n")

export const NEXUS_REFERRAL_PROGRAM_GUIDE = [
  "Referral code at signup or ?ref= link.",
  "Menu → Referrals: copy link after sign-in.",
  "Reward on referee first qualifying deposit — rules in-app.",
].join("\n")

export const NEXUS_FIXED_EARLY_EXIT_GUIDE = [
  "Early exit: fees on principal per confirm screen.",
  "Accrued earnings handled separately on exit.",
  "Read confirm totals before submit.",
].join("\n")

export const NEXUS_FIXED_ACCESS_TIER_HINT =
  "Fixed trade risk bands by account tier — see Container picker."

export const NEXUS_UI_WHERE_TO_GO = [
  "Wallet: balance, Add Funds, Withdraw.",
  "Container: fixed and copy flows.",
  "Settings: security, exchanges, preferences.",
].join("\n")
