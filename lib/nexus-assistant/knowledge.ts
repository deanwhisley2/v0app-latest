/**
 * Customer-facing assistant knowledge — plain language aligned with the live Quick Start guide.
 */

export const NEXUS_PRODUCT_NAME = "Nexus Pro"

export const NEXUS_PLATFORM_IDENTITY_SUMMARY = [
  "Nexus Pro is a crypto intelligence and trading participation platform.",
  "Members fund Nexus Main, choose Copy Trading or Fixed Trading, track open positions on the dashboard, and withdraw or reinvest from eligible balances.",
].join(" ")

export const NEXUS_QUICK_START_GUIDE = [
  "1) Add funds — available balance shows in Nexus Main after confirmation.",
  "2) Choose Copy Trading (~24h) or Fixed Trading (1 / 3 / 6 months).",
  "3) Start allocation from Nexus Main — funds stay reserved until the trade completes or allowed early exit.",
  "4) Track progress on the dashboard trading workspace.",
  "5) When a trade completes, earnings credit per current settlement rules (first to Pocket balance).",
  "6) Transfer earnings to Nexus Main when ready, then withdraw or open a new trade.",
].join("\n")

export const NEXUS_ASSISTANT_RESPONSE_STYLE = [
  "Answer style: professional, friendly, clear.",
  "Give a short answer first (1–3 lines). Offer detail only when the user asks for more.",
  "Use member-facing words: Nexus Main, available balance, processing balance, Copy Trading, Fixed Trading, Pocket balance.",
  "Avoid internal jargon: no copy desks, fixed desks, bullish-trade slices, stake locks, or ledger vocabulary unless the user uses those terms — then translate simply.",
].join("\n")

export const NEXUS_BALANCE_EXPLAINER = [
  "Nexus Main: your primary wallet for deposits, opening trades, and withdrawals.",
  "Available balance: funds you can use now for trades or withdrawal.",
  "Processing balance: deposits or transfers still being confirmed — not yet spendable.",
  "Pocket balance: holds completed trade earnings until you transfer them to Nexus Main (manual transfer).",
].join("\n")

export const NEXUS_CONTAINER_MODE_SUMMARY = [
  "Trading workspace offers Copy Trading and Fixed Trading.",
  "Copy Trading runs about 24 hours. Fixed Trading locks your allocation for 1, 3, or 6 months.",
  "Open trades from available Nexus Main balance. Active allocations cannot be withdrawn until released per platform rules.",
].join(" ")

export const NEXUS_COPY_TRADE_GUIDE = [
  "Copy Trading: pick an option, confirm allocation from Nexus Main, session runs ~24 hours.",
  "On completion: principal returns to Nexus Main; net earnings (after fees shown on confirm) go to Pocket balance.",
  "Transfer Pocket → Nexus Main when you want to reinvest or withdraw.",
].join("\n")

export const NEXUS_FIXED_TRADE_GUIDE = [
  "Fixed Trading: choose 1, 3, or 6 month term, confirm allocation and fees on screen.",
  "Funds stay in the active position until the term ends or you use allowed early exit (fees disclosed before confirm).",
  "Completed earnings settle to Pocket balance; transfer to Nexus Main manually.",
].join("\n")

export const NEXUS_SETTLEMENT_AND_TRANSFER_RULES = [
  "Settlement: when a trade completes, earnings credit per the rules shown at confirmation — not guaranteed market returns.",
  "Transfers: Pocket → Nexus Main is manual on the dashboard. No automatic sweep.",
  "Withdrawals: only from eligible Nexus Main balance; limits and verification shown in Wallet before submit.",
].join("\n")

export const NEXUS_ASSISTANT_OFF_TOPIC_REPLY =
  "I can help with Nexus Pro — funding, Copy or Fixed trading, balances, withdrawals, security, or referrals. What would you like to know?"

export const NEXUS_ASSISTANT_EXPLANATION_RULES = [
  "Lead with clarity and calm guidance — not hype.",
  "State that crypto participation carries risk; outcomes are not guaranteed.",
  "Point to on-screen terms and the trading workspace for live amounts and durations.",
  "For step-by-step help, follow the Quick Start order: fund → choose trade → allocate → track → earnings → withdraw/reinvest.",
].join("\n")

export const NEXUS_ASSISTANT_BEHAVIOR_GUIDELINES = [
  "Personality: calm, patient, helpful — never robotic or pushy.",
  "Scope: Nexus Pro only — trading, deposits, withdrawals, verification, security, referrals, balances, settlement.",
  `Off-topic: reply once with: "${NEXUS_ASSISTANT_OFF_TOPIC_REPLY}"`,
  "Never ask for seed phrases, private keys, or API secrets. Never help bypass verification.",
  "Short answer first; expand when asked.",
].join("\n")

/** @deprecated Use NEXUS_SETTLEMENT_AND_TRANSFER_RULES — kept for imports. */
export const NEXUS_EARNINGS_POCKET_FLOW = [
  "Completed trade earnings appear in Pocket balance first.",
  "Transfer to Nexus Main on your dashboard when you want them available for new trades or withdrawal.",
  "There is no automatic transfer — you control the timing.",
].join("\n")

/** @deprecated Customer alias — maps old “bullish trades” questions to earnings during a trade. */
export const NEXUS_BULLISH_TRADES_EXPLAINER = [
  "Trading earnings are participation gains credited while a Copy or Fixed trade is active or when it completes.",
  "They are not a promise of market direction — follow the live dashboard for your trade status.",
  "Completed amounts settle to Pocket balance; transfer to Nexus Main when ready.",
].join(" ")

export const NEXUS_SESSIONS_EXPLAINER = [
  "A trade session is your active Copy or Fixed allocation.",
  "Fund from Nexus Main, track on the dashboard, and settle per the rules shown at confirmation.",
].join(" ")

export const NEXUS_PLATFORM_USER_PAINS = [
  "Emotional trading under volatility",
  "Endless chart monitoring",
  "Complicated manual analysis",
  "Inconsistent participation habits",
].join(" · ")

export const NEXUS_PLATFORM_VALUE_PILLARS = [
  "Intelligent market analysis",
  "Copy Trading and Fixed Trading",
  "Monitored trading sessions",
  "Clear balance and withdrawal controls",
].join(" · ")

export const NEXUS_PLATFORM_CAPABILITIES = [
  "Nexus Main wallet with available and processing balances",
  "Copy Trading and Fixed Trading",
  "Dashboard progress tracking",
  "Deposits and withdrawals (with verification where required)",
  "Email and security verification",
  "Referral rewards and promotional bonuses",
  "Security Center and connected exchanges",
].join("\n")

export const NEXUS_FEES_EXPLAINER = [
  "Fees cover platform operations and trade infrastructure — quoted on the confirm screen before you commit.",
  "Early exit on Fixed Trading may include disclosed fees; read totals before submitting.",
].join("\n")

export const NEXUS_EARN_PATH_EXPLAINER = [
  "Members participate through funded Nexus Main balance and Copy or Fixed trades.",
  "Referral rewards apply during active promotional cycles (see Referrals).",
  "Withdrawals follow Wallet limits and verification shown before submit.",
].join("\n")

export function nexusPlatformOverviewForAssistant(): string {
  return [
    NEXUS_PLATFORM_IDENTITY_SUMMARY,
    "",
    "Quick Start:",
    NEXUS_QUICK_START_GUIDE,
    "",
    NEXUS_BALANCE_EXPLAINER,
    "",
    NEXUS_ASSISTANT_EXPLANATION_RULES,
  ].join("\n")
}

export const CONTAINER_WITHDRAWAL_SUMMARY =
  "After trades complete, earnings sit in Pocket balance. Transfer to Nexus Main manually, then withdraw per Wallet rules."

export function containerCustomerEarningsStory(): string {
  return [
    "Fund Nexus Main → choose Copy Trading or Fixed Trading → confirm allocation.",
    "Track the open trade on your dashboard.",
    "On completion → earnings to Pocket balance → transfer to Nexus Main when ready → withdraw or reinvest.",
  ].join("\n")
}

export function containerReturnFormulaLine(): string {
  return containerCustomerEarningsStory()
}

export const LEVEL_HINT = "Some trade options depend on your account tier shown in the app."

export const NEXUS_FUNDING_AND_RETAIL_DESK_HINT = [
  "Add Funds: crypto (USDT TRC20) or local mobile money.",
  "Submit payment reference after transfer. Status appears in Notifications.",
  "Processing balance clears to available balance once confirmed.",
].join("\n")

export const CONTAINER_ILLUSTRATIVE_MICRO_USD30 =
  "Illustrative only (not guaranteed): example ranges for small allocations — see the trading workspace for live terms."

export const NEXUS_WALLET_AND_WITHDRAWAL_RULES = [
  "Nexus Main: deposits, opening trades, withdrawals after transfer from Pocket.",
  "Pocket balance: completed trade earnings until you transfer to Nexus Main.",
  "Withdrawal requests reserve funds until approved or returned.",
  "Minimums and limits shown in Wallet before submit.",
].join("\n")

export const NEXUS_REFERRAL_PROGRAM_GUIDE = [
  "Referral program:",
  "• Earn rewards when a referee completes their first trade (see Referrals for current amount).",
  "• New members may receive one-time startup capital on signup during active campaigns.",
  "Referral code at signup or ?ref= link. Menu → Referrals to copy your link.",
].join("\n")

export const NEXUS_FIXED_EARLY_EXIT_GUIDE = [
  "Early exit on Fixed Trading: fees shown on the confirm screen.",
  "Net principal returns to Nexus Main; earnings settle per disclosed rules.",
  "Read confirm totals before submit.",
].join("\n")

export const NEXUS_FIXED_ACCESS_TIER_HINT =
  "Fixed Trading options may vary by account tier — see the trading workspace."

export const NEXUS_UI_WHERE_TO_GO = [
  "Dashboard: Nexus Main, Pocket balance, Quick guide, trading workspace.",
  "Wallet: Add Funds, Withdraw, Transfer to main balance.",
  "Settings: security, verification, exchanges, preferences.",
  "Referrals: your invite link and rewards.",
].join("\n")

export const NEXUS_AUTH_EMAIL_AND_LOGIN_GUIDE = [
  "Email verification (after signup):",
  "• Nexus sends a 6-digit code from Nexus pro (security@nexuspro.it.com). Reply-to: support@nexuspro.it.com.",
  "• Typical delivery: within 1 minute. Some providers (especially Gmail) may take up to 5 minutes.",
  "• Gmail: check Primary, Promotions, and Spam. Outlook: check Inbox and Junk.",
  "• The verify screen shows: email sent (provider accepted), on the way (allow a few minutes), or code not ready (tap resend).",
  "• Spam-folder tips appear only after a short wait — not immediately at signup.",
  "• Resend has a 60-second cooldown. Codes expire in 10 minutes.",
  "• You can skip verification and sign in later, then verify from Settings → Security & Recovery.",
  "",
  "Sign-in options:",
  "• Email tab: your registered email + account password.",
  "• Phone tab: mobile number linked at signup + account password (email verification still recommended for recovery).",
  "• Email code login / magic link: request a one-time sign-in link or code from the login screen when offered.",
  "",
  "Password recovery:",
  "• Use Forgot password on the sign-in screen with the same email you registered.",
  "• Recovery emails use the same delivery path as verification — wait up to 2 minutes and check spam folders.",
  "• Links expire; request a fresh one if needed.",
  "",
  "Troubleshooting (before contacting support):",
  "• Confirm you are using the same email or phone you registered with.",
  "• Wait at least one minute, then up to five minutes, before resending.",
  "• Check Promotions (Gmail) or Junk (Outlook) — security mail is often filtered there.",
  "• Try resend from the verify screen or Settings → Security & Recovery.",
  "• Never share live codes, passwords, or PINs with anyone claiming to be support.",
  "• If delivery still fails after two resend attempts, contact support@nexuspro.it.com from the email you registered with.",
].join("\n")

export const NEXUS_EMAIL_DELIVERABILITY_GUIDE = [
  "Nexus Pro uses Brevo for transactional security email (verification, recovery, sign-in codes).",
  "Sender: Nexus pro <security@nexuspro.it.com>. Support replies: support@nexuspro.it.com.",
  "Delivery expectations: under 1 minute typical; up to 5 minutes on some mobile and webmail providers.",
  "Domain warming: keep volume steady; avoid mixing promotional campaigns with security OTP mail.",
  "Institutional ops monitor accept/defer/bounce via Brevo logs and the admin deliverability dashboard.",
].join("\n")

export const NEXUS_VERIFICATION_AND_SECURITY_GUIDE = [
  NEXUS_AUTH_EMAIL_AND_LOGIN_GUIDE,
  "",
  "Account security:",
  "• Set your 6-digit Security PIN and withdrawal details in Settings → Security & Recovery before cash-out.",
  "• Never share passwords, PINs, or verification codes with anyone.",
].join("\n")
