import type { NexusAssistantInput, NexusAssistantSurface } from "./types"
import {
  CONTAINER_WITHDRAWAL_SUMMARY,
  CONTAINER_ILLUSTRATIVE_MICRO_USD30,
  NEXUS_PRODUCT_NAME,
  containerCustomerEarningsStory,
  LEVEL_HINT,
  NEXUS_FUNDING_AND_RETAIL_DESK_HINT,
  NEXUS_WALLET_AND_WITHDRAWAL_RULES,
  NEXUS_REFERRAL_PROGRAM_GUIDE,
  NEXUS_FIXED_EARLY_EXIT_GUIDE,
  NEXUS_FIXED_ACCESS_TIER_HINT,
  NEXUS_UI_WHERE_TO_GO,
  nexusPlatformOverviewForAssistant,
  NEXUS_ASSISTANT_EXPLANATION_RULES,
  NEXUS_ASSISTANT_BEHAVIOR_GUIDELINES,
  NEXUS_ASSISTANT_OFF_TOPIC_REPLY,
  NEXUS_BULLISH_TRADES_EXPLAINER,
  NEXUS_SESSIONS_EXPLAINER,
  NEXUS_FEES_EXPLAINER,
  NEXUS_EARN_PATH_EXPLAINER,
} from "./knowledge"

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

/** Rough USD amount if user wrote $30 / $ 1,000 etc. */
function parseRoughUsdFromMessage(raw: string): number | null {
  const m = raw.match(/\$\s*([\d,]+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number.parseFloat(m[1].replace(/,/g, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}

function hasAny(hay: string, words: string[]) {
  return words.some((w) => hay.includes(w))
}

function hasToken(hay: string, token: string) {
  const re = new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`)
  return re.test(hay)
}

const PLATFORM_TOPIC_HINTS = [
  "nexus",
  "wallet",
  "deposit",
  "withdraw",
  "trade",
  "trading",
  "container",
  "security",
  "account",
  "fund",
  "funding",
  "copy",
  "referral",
  "password",
  "login",
  "sign in",
  "balance",
  "earn",
  "earning",
  "bullish",
  "fixed",
  "appeal",
  "recover",
  "pin",
  "2fa",
  "usdt",
  "crypto",
  "mobile money",
  "mpesa",
  "session",
  "fee",
  "insurance",
  "verify",
  "joelin",
  "help",
  "how do",
  "how to",
  "safe",
  "trust",
  "payout",
  "notification",
  "settings",
]

function isPlatformRelated(q: string): boolean {
  return PLATFORM_TOPIC_HINTS.some((hint) => q.includes(hint))
}

function isLikelyOffTopic(q: string): boolean {
  if (q.length < 10) return false
  if (isPlatformRelated(q)) return false
  if (isGreeting(q)) return false
  return true
}

function isGreeting(q: string) {
  if (q.length > 28) return false
  return (
    /^(hi|hey|hello|yo|sup|hiya|howdy|gm)(\s*[!?.]*)$/.test(q) ||
    /^(hi|hey|hello)\s+there(\s*[!?.]*)$/.test(q) ||
    /^good (morning|afternoon|evening)\b/.test(q)
  )
}

/** L5 wallet desk — local draft before DeepSeek (no customer secrets). */
function adminDeskCopilotDraft(q: string): string {
  if (!q) {
    return [
      "Paste the user’s message, appeal summary, or what you need to investigate.",
      "",
      "I can help with: tone for a humane reply, a checklist for funding/withdrawal disputes, or how to document a resolution note in the desk.",
    ].join("\n")
  }
  if (
    hasAny(q, [
      "appeal",
      "dispute",
      "wrong amount",
      "did not receive",
      "scam",
      "fraud",
      "chargeback",
    ])
  ) {
    return [
      "Appeal / dispute triage (draft checklist for you):",
      "",
      "1) Confirm internal IDs (user UUID, request/withdrawal id, timestamps) against the operations desk row and financial-events ledger.",
      "2) Verify what the user was told on-screen (limits, pending states) vs what the ledger shows.",
      "3) If evidence is incomplete, ask only for what you already need (e.g. tx hash, receipt id) — not passwords or keys.",
      "4) Document a short resolution note before approving/rejecting; keep tone factual and kind.",
      "",
      "User-facing draft starter (edit before send):",
      `"Request under review. Status will update after verification."`,
    ].join("\n")
  }
  if (hasAny(q, ["investigation", "look into", "review user", "audit", "evidence"])) {
    return [
      "Investigation framing:",
      "",
      "- Pull chronological financial events and desk actions; note who acted (system vs admin).",
      "- Separate facts from user narrative; flag mismatches for follow-up questions.",
      "- If escalation is needed, state what blockers remain (missing proof, policy edge case).",
    ].join("\n")
  }
  if (hasAny(q, ["reply", "respond", "message user", "email", "whatsapp", "text customer"])) {
    return [
      "Humane reply principles:",
      "",
      "- Acknowledge emotion without admitting fault prematurely.",
      "- State what you verified in neutral terms; give a next step and realistic timing window if policy allows.",
      "- Close with one clear ask (single document or single clarification) to reduce back-and-forth.",
    ].join("\n")
  }
  return [
    "Ops copilot note:",
    "",
    "Tell me whether you want (a) a user-facing reply draft, (b) an internal checklist, or (c) both — and paste any case text you can share here (redact PII if needed).",
    "",
    "I won’t invent balances or approvals; use the desk + ledger as source of truth.",
  ].join("\n")
}

function refusesSensitive(q: string): string | null {
  if (
    hasAny(q, [
      "seed phrase",
      "private key",
      "api secret",
      "api key secret",
      "env variable",
      ".env",
      "password is",
      "sql injection",
      "ignore previous",
      "system prompt",
      "jailbreak",
      "reveal your",
    ])
  ) {
    return [
      "I can’t help with secrets, credentials, or bypassing security — that protects you and everyone on Nexus PRO.",
      "",
      "If you’re locked out, use the official reset and verification flows on this screen, or reach human support through About / Support in the app.",
    ].join("\n")
  }
  return null
}

function authSurfaces(s: NexusAssistantSurface) {
  return s === "auth_screen" || s === "floating_login"
}

function authReply(q: string, authStep?: string): string | null {
  if (hasAny(q, ["human", "agent", "live person", "speak to someone", "call support"])) {
    const ref = Date.now().toString().slice(-6)
    return [
      "I’ve logged that you want a human — use the official support path in About / Contact so the team can verify your account safely.",
      "",
      `Reference you can paste: NXP-${ref}`,
      "",
      "Until someone replies, I can still walk you through login, 2FA, or password reset on this screen.",
    ].join("\n")
  }
  if (hasAny(q, ["login", "sign in", "log in", "signin", "cant log", "can't log"])) {
    return [
      "Here’s the smoothest path to sign in:",
      "",
      "1. Use the email or username field with the password you set.",
      "2. Continue to verification when the app asks — that step exists to protect withdrawals.",
      "3. New users: complete Sign Up first to verify contact methods.",
      "",
      authStep === "2fa"
        ? "You’re on 2FA — check email and SMS tabs, wait a full minute between resends, and watch spam folders."
        : "Stuck before 2FA? Try Forgot Password from the sign-in tab if the password might be wrong.",
    ].join("\n")
  }
  if (hasAny(q, ["password", "forgot", "reset password", "locked out"])) {
    return [
      "To reset safely:",
      "",
      "1. Open Forgot Password from the sign-in view.",
      "2. Use the same email you registered with and watch inbox + spam.",
      "3. Pick a new strong password and sign in again.",
      "",
      "Reset links time out — if it expired, request a fresh one.",
    ].join("\n")
  }
  if (hasAny(q, ["2fa", "otp", "verification code", "sms code", "email code", "not receiving"])) {
    return [
      "When codes don’t arrive:",
      "",
      "• Confirm you’re on the method you actually registered (email vs phone).",
      "• Wait 60s before resend; carriers and inboxes batch messages.",
      "• Check spam / promotions folders for email OTP.",
      "• If you changed phone numbers, you’ll need account recovery through support.",
      "",
      "Never share a live code with anyone claiming to be support.",
    ].join("\n")
  }
  if (hasAny(q, ["sign up", "register", "create account", "new account"])) {
    return [
      "On Sign Up, use a valid email and phone for account security.",
      "",
      "If someone invited you, enter their Referral ID or open their signup link with ?ref= so attribution saves cleanly.",
      "",
      "After registration you’ll verify, then land on the dashboard where Connected Exchanges and Security Center are your next best clicks.",
    ].join("\n")
  }
  return null
}

function greetingReply(surface: NexusAssistantSurface, isGuest: boolean): string {
  const who = isGuest ? "Guest session. Register for full funding." : "Signed in."
  if (surface === "settings_learner") {
    return ["Nexus assistant.", who, "Topics: wallet, container, funding, security. Type: help"].join("\n")
  }
  return ["Nexus assistant.", who, "Query: wallet · trade · container · settings"].join("\n")
}

function helpTour(surface: NexusAssistantSurface): string {
  const tail =
    surface === "dashboard_wallstreet_assistant" || surface === "dashboard_chat"
      ? "Chat: assistant · support · account alerts."
      : "Settings: exchanges · security · wallet."
  return ["Navigation:", NEXUS_UI_WHERE_TO_GO, tail].join("\n")
}

/** Welcome line for first bubble — keep short. */
export function getNexusAssistantWelcome(surface: NexusAssistantSurface, isGuest: boolean): string {
  switch (surface) {
    case "settings_learner":
      return `Nexus assistant · ${NEXUS_PRODUCT_NAME}. Product help only.`
    case "auth_screen":
    case "floating_login":
      return `Nexus assistant · sign-in · verification.`
    case "floating_dashboard":
    case "bottom_nav_mini":
      return `Nexus assistant · wallet · trade · container.`
    case "dashboard_wallstreet_assistant":
    case "dashboard_chat":
      return `Nexus assistant · wallet · container · funding · security.`
    case "admin_desk_support_chat":
      return "Level-5 support copilot — appeals, investigations, and humane reply drafting. Outputs are drafts for you to review before any outbound message."
    default:
      return `Joelin for ${NEXUS_PRODUCT_NAME} — ask in plain language.`
  }
}

export function runNexusAssistant(input: NexusAssistantInput): string {
  const rawMsg = input.userMessage
  const q = norm(rawMsg)
  const { surface, tradingUserLevel, isGuest, authStep, focusSymbol } = input
  const roughUsd = parseRoughUsdFromMessage(rawMsg)

  const block = refusesSensitive(q)
  if (block) return block

  if (surface === "admin_desk_support_chat") {
    return adminDeskCopilotDraft(q)
  }

  if (!q) {
    return "Enter query: help · wallet · funding · container · security"
  }

  if (isGreeting(q)) return greetingReply(surface, isGuest)

  if (isLikelyOffTopic(q)) {
    return NEXUS_ASSISTANT_OFF_TOPIC_REPLY
  }

  if (
    hasAny(q, [
      "what is nexus",
      "what is nexus pro",
      "who is nexus",
      "about nexus",
      "about us",
      "tell me about nexus",
      "what do you do",
      "what does nexus",
      "who are you",
      "what is this platform",
      "what is this app",
      "why nexus pro",
      "why should i trust",
      "trust nexus",
      "is nexus legit",
      "is nexus safe",
    ]) ||
    (hasToken(q, "nexus") &&
      hasAny(q, ["what", "who", "about", "platform", "company", "app", "trust", "legit", "safe"]))
  ) {
    return [
      nexusPlatformOverviewForAssistant(),
      "",
      NEXUS_ASSISTANT_EXPLANATION_RULES,
      "",
      isGuest
        ? "Register to explore Wallet, Container, and Referrals. Settings → About for institutional contact."
        : "Settings → About for company channels. Say wallet, container, or referral for how-to.",
    ].join("\n")
  }

  if (
    hasAny(q, [
      "how does nexus work",
      "how does nexus pro work",
      "how it works",
      "how do you work",
      "how does this work",
    ])
  ) {
    return [
      nexusPlatformOverviewForAssistant(),
      "",
      NEXUS_SESSIONS_EXPLAINER,
      "",
      NEXUS_BULLISH_TRADES_EXPLAINER,
    ].join("\n")
  }

  if (hasAny(q, ["bullish trade", "bullish trades", "what are bullish"])) {
    return [NEXUS_BULLISH_TRADES_EXPLAINER, "", CONTAINER_WITHDRAWAL_SUMMARY].join("\n")
  }

  if (
    hasAny(q, [
      "what are sessions",
      "trading session",
      "trading sessions",
      "monitored session",
      "container session",
      "fixed session",
    ])
  ) {
    return [NEXUS_SESSIONS_EXPLAINER, "", containerCustomerEarningsStory()].join("\n")
  }

  if (
    hasAny(q, [
      "how do users earn",
      "how do i earn",
      "how can i earn",
      "how to earn",
      "how users earn",
      "make money on nexus",
    ])
  ) {
    return [
      NEXUS_EARN_PATH_EXPLAINER,
      "",
      containerCustomerEarningsStory(),
      "",
      NEXUS_REFERRAL_PROGRAM_GUIDE,
    ].join("\n")
  }

  if (
    hasAny(q, [
      "why fee",
      "why fees",
      "why are there fees",
      "what are the fees",
      "platform fee",
      "insurance fee",
    ])
  ) {
    return [NEXUS_FEES_EXPLAINER, "", NEXUS_WALLET_AND_WITHDRAWAL_RULES].join("\n")
  }

  if (
    hasAny(q, [
      "where is",
      "where do i find",
      "how do i open wallet",
      "how to add fund",
      "how to deposit",
      "how to withdraw",
      "open referrals",
      "referral link where",
    ])
  ) {
    return [
      "Here’s where common actions live:",
      "",
      NEXUS_UI_WHERE_TO_GO,
      "",
      "Say referral, wallet, or container if you want rules for that area.",
    ].join("\n")
  }

  if (hasAny(q, ["help", "lost", "where do i", "how do i start", "menu"])) {
    return helpTour(surface)
  }

  if (authSurfaces(surface) || (surface === "floating_dashboard" && hasAny(q, ["login", "password", "2fa", "otp", "sign up"]))) {
    const a = authReply(q, authStep)
    if (a) return a
  }

  if (hasAny(q, ["thanks", "thank you", "thx", "appreciate"])) {
    return "Acknowledged. Security Center recommended."
  }

  if (hasAny(q, ["bye", "goodbye", "see you"])) {
    return "Session ended. Nexus assistant available on return."
  }

  // “How much if I fix $X?” — trader-first story, optional illustrative micro bands
  const asksMoneyOutcome =
    hasAny(q, [
      "how much",
      "how much can",
      "how much will",
      "can i get",
      "will i earn",
      "what can i earn",
      "if i fix",
      "i fix",
      "fixing",
    ]) &&
    (hasAny(q, ["fix", "container", "lock", "stake", "trader", "coin", "month", "usd", "dollar"]) ||
      /\$\s*[\d]/.test(rawMsg))

  if (asksMoneyOutcome) {
    const lines = [containerCustomerEarningsStory(), CONTAINER_WITHDRAWAL_SUMMARY]
    if (roughUsd != null && roughUsd >= 20 && roughUsd <= 50) {
      lines.push(CONTAINER_ILLUSTRATIVE_MICRO_USD30)
    } else if (roughUsd != null) {
      lines.push("See Container screen for live accrual.")
    }
    lines.push(isGuest ? "Register for full container access." : "Open Container · select trader · confirm on-screen.")
    return lines.join("\n")
  }

  if (
    hasAny(q, [
      "referral",
      "referrals",
      "refer a friend",
      "invite friend",
      "invite code",
      "referral code",
      "referral link",
      "my referral",
      "ref code",
      "?ref",
      "invite link",
    ])
  ) {
    return [
      NEXUS_REFERRAL_PROGRAM_GUIDE,
      "",
      "Navigation: tap your avatar → Referrals (or Refer to Earn) after you’re logged in.",
    ].join("\n")
  }

  if (
    hasAny(q, [
      "pending withdrawal",
      "frozen withdrawal",
      "withdraw approved",
      "withdraw rejected",
      "liquidity admin",
      "approve my withdrawal",
      "withdrawal pending",
      "why withdraw stuck",
    ])
  ) {
    return [
      NEXUS_WALLET_AND_WITHDRAWAL_RULES,
      "",
      "If your withdrawal stays pending, it’s waiting in the operator queue — use official support if it exceeds the usual timing window shown near Wallet.",
    ].join("\n")
  }

  if (
    hasAny(q, [
      "early exit",
      "early pullout",
      "pull out early",
      "leave early",
      "cancel fixed",
      "default fee",
      "break the lock",
      "end fix early",
    ])
  ) {
    return [
      NEXUS_FIXED_EARLY_EXIT_GUIDE,
      "",
      NEXUS_FIXED_ACCESS_TIER_HINT,
    ].join("\n")
  }

  // Container — high priority when user names it
  if (
    hasAny(q, [
      "container",
      "container mode",
      "fix period",
      "fixed trade",
      "frozen stake",
      "lock period",
      "copy master",
      "master trader",
    ])
  ) {
    return [
      "Container mode is where you run the fixed-term flows shown in the Wallstreet tab — pick a master profile, choose your lock length, and read the stake rules on the card before you confirm.",
      "",
      containerCustomerEarningsStory(),
      "",
      CONTAINER_WITHDRAWAL_SUMMARY,
      "",
      "Practical rhythm: open Container daily to watch scheduled accrual and any withdrawal windows the UI unlocks — that’s the “every day” habit successful users build (checking progress, not chasing hype).",
      "",
      "Funding rule: fixed locks spend from Nexus Main only — if Main can’t cover stake plus upfront fees, reduce size or add funds first.",
      "",
      focusSymbol
        ? `You currently have ${focusSymbol} on the desk — you can still run Container flows; the coin context and container pick are independent, so follow whichever plan matches your risk plan.`
        : "Pick a coin context on the desk when you want price-linked views; container schedules are about the program you join, not a single tweet-sized tip.",
    ].join("\n")
  }

  if (
    hasAny(q, [
      "insurance fee",
      "upfront fee",
      "fee when i open",
      "deduct fee",
      "why fee",
      "nexus main",
      "main balance",
      "not enough balance",
      "insufficient balance",
    ])
  ) {
    return [
      "Fixed programs quote fees at initiation (including insurance-style charges) — they’re separate from your locked stake and are shown before you confirm.",
      "",
      NEXUS_WALLET_AND_WITHDRAWAL_RULES,
      "",
      NEXUS_FIXED_ACCESS_TIER_HINT,
    ].join("\n")
  }

  // Earnings / everyday — supportive, specific to app surfaces
  if (
    hasAny(q, [
      "earn every",
      "everyday",
      "every day",
      "daily income",
      "passive",
      "make money",
      "how do i earn",
      "earning with",
      "profit every",
    ])
  ) {
    return [
      "I hear you — you want a steady rhythm with Nexus PRO, not fluff.",
      "",
      "What “every day” actually means inside the product:",
      "",
      "1. Dashboard habit — open Trade once a day to align with your plan: spot ideas, automation guardrails, and your balances are all in one loop.",
      "2. Wallet habit — check available vs staked, and any earn tiles you opted into; those surfaces update on their own schedules.",
      "3. Container habit — if you join a fixed program, the UI is designed so you can review scheduled accrual and withdrawal windows on a regular cadence (see Container for your exact curve).",
      "",
      containerCustomerEarningsStory(),
      "",
      "I’m not promising market returns — I’m pointing at where Nexus PRO already exposes progress. Start with Security Center + Connected Exchanges so anything you earn is on firm footing.",
      "",
      LEVEL_HINT,
    ].join("\n")
  }

  if (hasAny(q, ["trust", "legit", "scam", "safe", "who are you"])) {
    return [
      "Trust is earned through transparent flows: verified sign-in, Security Center checkpoints, and exchange keys you control.",
      "",
      "Nexus PRO doesn’t ask for your seed phrase in chat — ever. If someone does, it isn’t us.",
      "",
      "Work with us slowly: fund small, learn the screens, scale only after each layer feels boring and reliable.",
    ].join("\n")
  }

  if (hasAny(q, ["revenue", "how do you make money", "business model", "fees", "pricing", "subscription"])) {
    return [
      "Commercial detail lives in Terms / notices so numbers stay accurate.",
      "",
      "Conceptually Nexus PRO grows when traders stay engaged: connected venues, automation, and premium workflows you’ll discover in-product. My job is to help you use those surfaces well — not to negotiate pricing in chat.",
    ].join("\n")
  }

  if (hasAny(q, ["exchange", "connect", "api key", "link account", "bitget", "kucoin", "bybit"])) {
    return [
      "Open Settings → Connected Exchanges.",
      "",
      "Link only what you need, rotate keys if you change your mind, and pair every new connection with Security Center alerts so you see withdrawals before they surprise you.",
    ].join("\n")
  }

  if (hasAny(q, ["security", "2fa", "hacked", "phish"])) {
    return [
      "Settings → Security Center is your home base.",
      "",
      "Enable tier features, monitor device alerts, pause deposits if activity looks unusual.",
    ].join("\n")
  }

  if (hasAny(q, ["deposit", "withdraw", "funding", "add funds", "cash out", "balance", "minimum deposit", "minimum withdraw", "min deposit", "min withdrawal"])) {
    return [
      NEXUS_WALLET_AND_WITHDRAWAL_RULES,
      "",
      "Dashboard → Add Funds / Withdraw: Option A is company crypto treasury; Option B is local mobile money through vetted desks when your country aligns.",
      "",
      NEXUS_FUNDING_AND_RETAIL_DESK_HINT,
      "",
      "Whatever path you choose, double-check identities/addresses shown in-app before sending cash or crypto externally, keep receipts, and use Appeals if something stalls — I cannot see other traders’ receipts or PINs.",
    ].join("\n")
  }

  if (
    hasAny(q, ["trade", "buy", "sell", "order", "market", "limit"]) ||
    hasToken(q, "nex") ||
    hasAny(q, ["bot", "automation"])
  ) {
    return [
      focusSymbol
        ? `For ${focusSymbol}: use the desk controls for analysis, then execute only when size and risk match what you set in Security Center.`
        : "Pick a symbol on the desk so charts and panels line up — then size trades against the risk blockers you configured.",
      "",
      "Automation (NEX-style) should always be smaller than your ‘tuition’ budget until you trust the loop.",
      "",
      LEVEL_HINT,
    ].join("\n")
  }

  if (hasAny(q, ["bitcoin", "btc", "eth", "price prediction", "should i buy", "moon"])) {
    return [
      "I won’t give personal buy/sell calls — that’s outside what an in-app navigator should do.",
      "",
      "I will get you to the tools: live desk, strategies, risk panel, and funding — so any decision is yours, on purpose.",
    ].join("\n")
  }

  if (hasAny(q, ["weather", "joke", "recipe", "politics", "football", "gpt"])) {
    return [
      "I stay inside Nexus PRO so you get consistent guidance.",
      "",
      "Try: container, earnings, exchange, security, or help.",
    ].join("\n")
  }

  // Level boundary
  if (hasAny(q, ["level 5", "vip tier", "admin", "employee", "backend"])) {
    return [
      `I only know what your current tier (${tradingUserLevel}) unlocks in the UI — I won’t guess admin or unreleased features.`,
      "",
      LEVEL_HINT,
    ].join("\n")
  }

  return [
    `I’m focused on ${NEXUS_PRODUCT_NAME} — I didn’t match a specific intent in that message.`,
    "",
    "Try one word: help, wallet, referral, withdrawal, container, earnings, exchange, security, funding, trade.",
    "",
    isGuest
      ? "Guest tip: registering unlocks the full funding + exchange linking loop when your team enables it."
      : "Signed-in tip: Settings → Security Center first, then Connected Exchanges, then scale what you do on Trade.",
  ].join("\n")
}
