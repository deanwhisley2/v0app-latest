/**
 * Customer-facing assistant knowledge — short, institutional. No internal formulas or treasury detail.
 */

export const NEXUS_PRODUCT_NAME = "Nexus Pro"

/** Canonical “who we are” — Joelin / DeepSeek and local fallback must align with this. */
export const NEXUS_PLATFORM_IDENTITY_SUMMARY = [
  "Nexus Pro is a crypto intelligence and automated trading assistance platform designed to help simplify participation in cryptocurrency markets.",
  "Built for people who find trading stressful, time-consuming, or difficult to manage consistently.",
].join(" ")

export const NEXUS_PLATFORM_USER_PAINS = [
  "Analyzing charts for long hours",
  "Following signals without a clear plan",
  "Emotional decision-making under volatility",
  "Always monitoring the market",
].join(" · ")

export const NEXUS_PLATFORM_VALUE_PILLARS = [
  "Intelligent market analysis",
  "Automation systems",
  "Copy trading technology",
  "Monitored trading sessions",
].join(" · ")

export const NEXUS_CONTAINER_MODE_SUMMARY = [
  "Nexus Container Mode connects users to selected trading sessions or trader activity.",
  "The system helps execute trades automatically from live market conditions and the session timeframe the user selects.",
  "Goal: a more structured, convenient experience without staying on charts all day.",
].join(" ")

export const NEXUS_PLATFORM_CAPABILITIES = [
  "Automated deposits and withdrawals (with operator review where policy requires)",
  "Referral rewards and first-deposit promotional bonuses",
  "Monitored fund-protection and verification workflows",
  "Wallet, Container, Trade/Wallstreet, and Security Center in one app",
].join("\n")

/** How Joelin should talk about Nexus Pro in any surface. */
export const NEXUS_ASSISTANT_EXPLANATION_RULES = [
  "Lead with automation and convenience — not hype.",
  "State clearly that crypto markets carry risk; outcomes are not guaranteed.",
  "Present Nexus Pro as assistance through intelligent systems and monitored infrastructure — never promise fixed profits.",
  "Point to on-screen terms, Container UI, and Referrals for live promo amounts when numbers may vary by campaign.",
].join("\n")

/** Full overview block for “what is Nexus Pro?” style questions. */
export function nexusPlatformOverviewForAssistant(): string {
  return [
    NEXUS_PLATFORM_IDENTITY_SUMMARY,
    "",
    "Many users struggle with: " + NEXUS_PLATFORM_USER_PAINS + ".",
    "",
    "Nexus Pro combines: " + NEXUS_PLATFORM_VALUE_PILLARS + ".",
    "",
    NEXUS_CONTAINER_MODE_SUMMARY,
    "",
    "Platform also supports:",
    NEXUS_PLATFORM_CAPABILITIES,
    "",
    NEXUS_ASSISTANT_EXPLANATION_RULES,
  ].join("\n")
}

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
  "Referral program (customer-facing):",
  "• Earn $0.53 for every successful referral (per in-app Referrals rules when credited).",
  "• New users: 20% bonus on their first successful deposit (promotional — confirm eligibility on the deposit screen).",
  "Referral code at signup or ?ref= link.",
  "Menu → Referrals (or Refer to Earn): copy your link after sign-in.",
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
