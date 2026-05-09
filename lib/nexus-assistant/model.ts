import type { NexusAssistantInput, NexusAssistantSurface } from "./types"
import {
  CONTAINER_WITHDRAWAL_SUMMARY,
  CONTAINER_ILLUSTRATIVE_MICRO_USD30,
  NEXUS_PRODUCT_NAME,
  containerCustomerEarningsStory,
  LEVEL_HINT,
  NEXUS_FUNDING_AND_RETAIL_DESK_HINT,
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

function isGreeting(q: string) {
  if (q.length > 28) return false
  return (
    /^(hi|hey|hello|yo|sup|hiya|howdy|gm)(\s*[!?.]*)$/.test(q) ||
    /^(hi|hey|hello)\s+there(\s*[!?.]*)$/.test(q) ||
    /^good (morning|afternoon|evening)\b/.test(q)
  )
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
      "3. If you’re new, switch to Sign Up first so we can verify your contact methods.",
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
      "Welcome in advance — on Sign Up, use a real email and phone you control; we use them for security, not spam.",
      "",
      "After registration you’ll verify, then land on the dashboard where Connected Exchanges and Security Center are your next best clicks.",
    ].join("\n")
  }
  return null
}

function greetingReply(surface: NexusAssistantSurface, isGuest: boolean): string {
  const who = isGuest ? "You’re browsing as a guest — some funding paths stay read-only until you register." : "You’re signed in — I can point you to live tools on the dashboard."
  if (surface === "settings_learner") {
    return [
      "Hi — I’m Joelin, your in-app guide for Nexus PRO.",
      "",
      who,
      "",
      "Ask how earnings show up, how Container mode works, where to connect exchanges, or type help for a structured tour.",
    ].join("\n")
  }
  return [
    "Hi — thanks for being here.",
    "",
    who,
    "",
    "Tell me what you’re trying to do on Nexus PRO (trade desk, wallet, settings, or Container) and I’ll walk you through the exact area of the app.",
  ].join("\n")
}

function helpTour(surface: NexusAssistantSurface): string {
  const tail =
    surface === "dashboard_wallstreet_assistant"
      ? "From this desk: ask Joelin for platform questions, use Strategies for votes, and Container when you’re ready for fixed-term flows — always confirm numbers on-screen."
      : "From Settings: Connected Exchanges, Security Center, Deposit & Withdraw, and Joelin (here in Settings) are the trust pillars we recommend in order."
  return [
    "Quick tour — Nexus PRO is built as a stack:",
    "",
    "• Trade / Wallstreet — live context, signals workspace, automation helpers.",
    "• Wallet — balances, earn tiles, movement history (what your tier shows).",
    "• Settings — exchanges, security, funding, notifications, About/legal.",
    "",
    tail,
  ].join("\n")
}

/** Welcome line for first bubble — keep short. */
export function getNexusAssistantWelcome(surface: NexusAssistantSurface, isGuest: boolean): string {
  switch (surface) {
    case "settings_learner":
      return `I’m Joelin — I only answer ${NEXUS_PRODUCT_NAME} product questions (nothing secret, nothing above your tier). Ask how a screen works or say help.`
    case "auth_screen":
    case "floating_login":
      return `I’m Joelin — your ${NEXUS_PRODUCT_NAME} sign-in helper for accounts, passwords, and verification.`
    case "floating_dashboard":
    case "bottom_nav_mini":
      return `I’m Joelin — your ${NEXUS_PRODUCT_NAME} pocket guide for trades, wallet, Container, and settings.`
    case "dashboard_wallstreet_assistant":
      return `I’m Joelin on Wallstreet — desk tools plus ${NEXUS_PRODUCT_NAME} navigation so you never feel lost.`
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

  if (!q) {
    return "Type a short question about Nexus PRO — for example: help, container, earnings, exchange, or security."
  }

  if (isGreeting(q)) return greetingReply(surface, isGuest)

  if (hasAny(q, ["help", "lost", "where do i", "how do i start", "menu"])) {
    return helpTour(surface)
  }

  if (authSurfaces(surface) || (surface === "floating_dashboard" && hasAny(q, ["login", "password", "2fa", "otp", "sign up"]))) {
    const a = authReply(q, authStep)
    if (a) return a
  }

  if (hasAny(q, ["thanks", "thank you", "thx", "appreciate"])) {
    return [
      "You’re very welcome.",
      "",
      "The best way to thank your future self on Nexus PRO is to finish Security Center and only connect exchanges with keys you understand — that’s how pros sleep at night.",
    ].join("\n")
  }

  if (hasAny(q, ["bye", "goodbye", "see you"])) {
    return "Whenever you’re back, I’m here for Nexus PRO navigation — stay safe and trade within what you can afford to learn."
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
    const lines = [
      "Great question — in a Container your outcome tracks the trader you choose and how many quality opportunities they take while your capital is fixed with the coin.",
      "",
      containerCustomerEarningsStory(),
      "",
      CONTAINER_WITHDRAWAL_SUMMARY,
      "",
    ]
    if (roughUsd != null && roughUsd >= 20 && roughUsd <= 50) {
      lines.push(CONTAINER_ILLUSTRATIVE_MICRO_USD30)
      lines.push("")
    } else if (roughUsd != null) {
      lines.push(
        "For your amount, the live Container preview and post-lock dashboard show how the desk accrues day by day — longer fixes give your trader more runway to work the capital."
      )
      lines.push("")
    }
    if (isGuest) {
      lines.push(
        "You’re in a guest session — registering unlocks the full funding, trader pick, and exchange linking flow when your team enables it."
      )
    } else {
      lines.push("Open Wallstreet → Container, pick a trader you trust, then watch the screen after you lock — that view is built for momentum.")
    }
    return lines.join("\n")
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
      focusSymbol
        ? `You currently have ${focusSymbol} on the desk — you can still run Container flows; the coin context and container pick are independent, so follow whichever plan matches your risk plan.`
        : "Pick a coin context on the desk when you want price-linked views; container schedules are about the program you join, not a single tweet-sized tip.",
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
      "Turn on everything your tier offers, read device alerts, and pause deposits if anything looks off — we’d rather you wait an hour than move fast into a trap.",
    ].join("\n")
  }

  if (hasAny(q, ["deposit", "withdraw", "funding", "add funds", "cash out", "balance"])) {
    return [
      "Dashboard header → Add Funds: Option A is company crypto treasury; Option B is local mobile money through vetted desks when your country aligns.",
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
    "Try one word: help, container, earnings, exchange, security, funding, trade.",
    "",
    isGuest
      ? "Guest tip: registering unlocks the full funding + exchange linking loop when your team enables it."
      : "Signed-in tip: Settings → Security Center first, then Connected Exchanges, then scale what you do on Trade.",
  ].join("\n")
}
