/**
 * Customer-facing assistant knowledge — short, institutional. No internal formulas or treasury detail.
 */

export const NEXUS_PRODUCT_NAME = "Nexus Pro"

/** Canonical “who we are” — Joelin / DeepSeek and local fallback must align with this. */
export const NEXUS_PLATFORM_IDENTITY_SUMMARY = [
  "Nexus Pro is a crypto intelligence and automated trading participation platform designed to simplify participation in cryptocurrency markets.",
  "It combines intelligent market analysis, automated trading systems, monitored trading sessions, copy trading technology, and connected trading infrastructure.",
].join(" ")

export const NEXUS_PLATFORM_USER_PAINS = [
  "Emotional trading under volatility",
  "Endless chart monitoring",
  "Complicated manual analysis",
  "Inconsistent participation habits",
].join(" · ")

export const NEXUS_PLATFORM_VALUE_PILLARS = [
  "Intelligent market analysis",
  "Automation systems",
  "Copy trading technology",
  "Monitored trading sessions",
].join(" · ")

export const NEXUS_CONTAINER_MODE_SUMMARY = [
  "Container Mode connects users to selected trading sessions and trader desks.",
  "Fixed programs lock principal for a term; bullish trades accrue on the schedule shown on your Container screen.",
  "Goal: structured participation without staying on charts all day.",
].join(" ")

export const NEXUS_PLATFORM_CAPABILITIES = [
  "Automated trading participation",
  "Copy trading systems",
  "Smart market analysis",
  "Automated deposits and withdrawals (with operator review where policy requires)",
  "Monitored trading sessions",
  "Referral rewards and promotional bonuses",
  "Wallet, Container, Trade/Wallstreet, and Security Center in one app",
].join("\n")

/** How Joelin should talk about Nexus Pro in any surface. */
export const NEXUS_ASSISTANT_EXPLANATION_RULES = [
  "Lead with automation and convenience — not hype.",
  "State clearly that crypto markets carry risk; outcomes are not guaranteed.",
  "Use customer vocabulary: trading sessions (not “income desks”), bullish trades (scheduled participation gains — not guaranteed market returns).",
  "Point to on-screen terms, Container UI, and Referrals for live promo amounts when numbers may vary by campaign.",
].join("\n")

export const NEXUS_BULLISH_TRADES_EXPLAINER = [
  "Bullish trades are the participation gains credited on your Container schedule during an active fixed or copy session.",
  "They are not a promise of market direction — they reflect the program’s accrual model while your allocation is active.",
  "Release rules, fees, and maturity are always shown on the Container screen before you confirm.",
].join(" ")

export const NEXUS_SESSIONS_EXPLAINER = [
  "Sessions are structured trading participation windows — fixed locks (1/3/6 months) or copy cycles you select with a desk.",
  "Principal stays governed by the program; bullish trades can be released to pocket per on-screen rules.",
].join(" ")

export const NEXUS_FEES_EXPLAINER = [
  "Fees cover platform operations, risk controls, and session infrastructure — insurance-style charges on fixed programs are quoted before you lock.",
  "Release and early-exit fees are disclosed on the confirm screen; never send funds outside in-app instructions.",
].join(" ")

export const NEXUS_EARN_PATH_EXPLAINER = [
  "Users participate through funded Nexus Main balance, Container sessions, and optional copy programs.",
  "Bullish trades accrue on the published schedule; referral rewards apply during active promotional cycles (see Referrals).",
  "Withdrawals follow wallet limits and review rules shown before submit.",
].join(" ")

/** Full overview block for “what is Nexus Pro?” style questions. */
export function nexusPlatformOverviewForAssistant(): string {
  return [
    NEXUS_PLATFORM_IDENTITY_SUMMARY,
    "",
    "Many users want to reduce: " + NEXUS_PLATFORM_USER_PAINS + ".",
    "",
    "Nexus Pro combines: " + NEXUS_PLATFORM_VALUE_PILLARS + ".",
    "",
    NEXUS_CONTAINER_MODE_SUMMARY,
    "",
    "Platform features:",
    NEXUS_PLATFORM_CAPABILITIES,
    "",
    NEXUS_ASSISTANT_EXPLANATION_RULES,
  ].join("\n")
}

export const CONTAINER_WITHDRAWAL_SUMMARY =
  "Bullish trades release to pocket when available. Principal locked until maturity or early exit. Pocket withdrawal cap: 50% of liquid total per request."

export function containerCustomerEarningsStory(): string {
  return [
    "Container: lock funds with a selected desk for a fixed term or copy cycle.",
    "Bullish trades accrue on schedule — live Container screen is authoritative.",
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
  "• Earn $0.53 for every successful referral when credited per in-app Referrals rules.",
  "• Qualifying first deposits may receive a promotional bonus during the current promotional cycle — confirm on the deposit screen.",
  "Referral code at signup or ?ref= link.",
  "Menu → Referrals (or Refer to Earn): copy your link after sign-in.",
].join("\n")

export const NEXUS_FIXED_EARLY_EXIT_GUIDE = [
  "Early exit: fees on principal per confirm screen.",
  "Accrued bullish trades handled separately on exit.",
  "Read confirm totals before submit.",
].join("\n")

export const NEXUS_FIXED_ACCESS_TIER_HINT =
  "Fixed trade risk bands by account tier — see Container picker."

export const NEXUS_UI_WHERE_TO_GO = [
  "Wallet: balance, Add Funds, Withdraw.",
  "Container: fixed and copy flows.",
  "Settings: security, exchanges, preferences.",
].join("\n")
