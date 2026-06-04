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
  "Copy sessions run about 24 hours; fixed programs lock principal for 1, 3, or 6 months.",
  "When a session ends, trade earnings land in Pocket balance first — you move them to Nexus Main when ready.",
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

/** Core chat personality and guardrails (customer surfaces). */
export const NEXUS_ASSISTANT_BEHAVIOR_GUIDELINES = [
  "Personality: calm, patient, helpful, and humane — never robotic or pushy.",
  "Tone: friendly, professional, and reassuring. Guide gently; do not force users into topics they did not ask about.",
  "Scope: only answer questions about Nexus Pro — trading, deposits, withdrawals, account security, recovery, Container sessions, copy trading, referrals, and in-app features.",
  "Off-topic: if the user asks something unrelated (weather, general trivia, other apps), reply exactly once with: “I can help you with questions about Nexus Pro — trading, deposits, withdrawals, security, or account features. What would you like to know?”",
  "Sensitive topics (safety of funds, withdrawals, recovery): be extra clear and reassuring — e.g. funds are held securely; withdrawals follow verification shown in the app; offer step-by-step guidance when asked.",
  "Never ask for seed phrases, private keys, or API secrets. Never help bypass verification.",
  "Avoid internal jargon in replies: no retailer desk, treasury pool, Nexus Main attribution, gross commit, settlement trace, or ledger vocabulary.",
].join("\n")

export const NEXUS_ASSISTANT_OFF_TOPIC_REPLY =
  "I can help you with questions about Nexus Pro — trading, deposits, withdrawals, security, or account features. What would you like to know?"

export const NEXUS_BULLISH_TRADES_EXPLAINER = [
  "Bullish trades are participation gains credited on your Container schedule during an active fixed or copy session.",
  "They are not a promise of market direction — they reflect the program’s accrual model while your allocation is active.",
  "During a fixed plan you can release slices to Pocket while the lock runs; when the session completes, remaining earnings also go to Pocket.",
].join(" ")

export const NEXUS_SESSIONS_EXPLAINER = [
  "Sessions are structured participation windows — fixed locks (1/3/6 months) or copy cycles (~24 hours) you select with a desk.",
  "Open trades from Nexus Main; principal returns to Nexus Main when the session ends; earnings go to Pocket until you transfer them.",
].join(" ")

export const NEXUS_EARNINGS_POCKET_FLOW = [
  "Pocket balance holds trade earnings after a session completes (and optional bullish-trade releases during a fixed lock).",
  "Nexus Main is for funding new trades and withdrawals — earnings do not jump there automatically.",
  "Home → Pocket balance → Transfer to main balance when you want earnings available for new trades or cash-out.",
  "There is no automatic first-deposit bonus; the one-time new-member offer is startup capital on signup (see Referrals / welcome banner).",
].join("\n")

export const NEXUS_COPY_TRADE_GUIDE = [
  "Copy: pick a desk, commit stake from Nexus Main, session runs ~24 hours.",
  "On completion: stake returns to Nexus Main; net earnings (after the session fee shown on confirm) go to Pocket.",
  "Early pull-out uses on-screen fees; earnings still follow Pocket rules when applicable.",
].join("\n")

export const NEXUS_FEES_EXPLAINER = [
  "Fees cover platform operations, risk controls, and session infrastructure — insurance-style charges on fixed programs are quoted before you lock.",
  "Release and early-exit fees are disclosed on the confirm screen; never send funds outside in-app instructions.",
].join("\n")

export const NEXUS_EARN_PATH_EXPLAINER = [
  "Users participate through funded Nexus Main balance, Container sessions, and optional copy programs.",
  "Bullish trades accrue on the published schedule; referral rewards apply during active promotional cycles (see Referrals).",
  "Withdrawals follow wallet limits and review rules shown before submit.",
].join("\n")

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
  "After sessions complete, earnings sit in Pocket balance. Transfer to Nexus Main manually when ready, then withdraw per wallet rules (24h cooldown)."

export function containerCustomerEarningsStory(): string {
  return [
    "Container: lock funds from Nexus Main with a desk (copy ~24h or fixed 1/3/6 mo).",
    "Bullish trades accrue on schedule — live Container screen is authoritative.",
    "Session end → earnings to Pocket; optional releases to Pocket during fixed locks.",
    "Transfer Pocket → Nexus Main on your dashboard when you want to reuse or withdraw.",
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
  "Illustrative only (not guaranteed): ~$8–9 / 1 mo, ~$24–27 / 3 mo, ~$48–53 / 6 mo on ~$30 at 27–30% monthly policy — see Container screen."

export const NEXUS_WALLET_AND_WITHDRAWAL_RULES = [
  "Nexus Main: deposits, opening container trades, withdrawals after transfer from Pocket.",
  "Pocket balance: session earnings land here first; use Transfer to main balance when ready.",
  "Withdrawal: amount reserved until approved or returned.",
  "Minimums and limits shown in Wallet before submit.",
].join("\n")

export const NEXUS_REFERRAL_PROGRAM_GUIDE = [
  "Referral program (customer-facing):",
  "• Earn $0.26 when a referee completes their first trade (referrer reward — see Referrals).",
  "• New members may receive one-time startup capital on signup during the active welcome campaign — not a first-deposit bonus.",
  "Referral code at signup or ?ref= link.",
  "Menu → Referrals (or Refer to Earn): copy your link after sign-in.",
].join("\n")

export const NEXUS_FIXED_EARLY_EXIT_GUIDE = [
  "Early exit: fees on principal per confirm screen.",
  "Unreleased bullish-trade earnings go to Pocket (1% release fee on that slice); net principal returns to Nexus Main.",
  "Read confirm totals before submit.",
].join("\n")

export const NEXUS_FIXED_ACCESS_TIER_HINT =
  "Fixed trade risk bands by account tier — see Container picker."

export const NEXUS_UI_WHERE_TO_GO = [
  "Wallet: Nexus Main, Pocket balance, Add Funds, Withdraw, Transfer to main balance.",
  "Container: copy and fixed flows.",
  "Settings: security, exchanges, preferences.",
].join("\n")
