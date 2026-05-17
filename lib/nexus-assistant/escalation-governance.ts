import { detectHumanEscalationIntent } from "@/lib/nexus-assistant/human-escalation"

const IMMEDIATE_ESCALATION_PATTERNS: RegExp[] = [
  /\bwithdrawal\s+(stuck|failed|rejected|dispute)/i,
  /\bfunding\s+(stuck|failed|rejected|missing|dispute)/i,
  /\bpayout\s+(stuck|failed|missing|dispute)/i,
  /\bcrypto\s+(mismatch|wrong|failed|rejected)/i,
  /\bduplicate\s+(deposit|payment|transaction)/i,
  /\blocked\s+balance/i,
  /\bsettlement\s+(failed|stuck)/i,
]

const FUNDING_PAYOUT_KEYWORDS =
  /\b(funding|deposit|withdrawal|payout|balance|settlement|appeal|dispute|refund)\b/i

export type EscalationGovernanceInput = {
  userMessage: string
  /** Prior assistant turns in this session (user messages only). */
  priorUserTurns?: string[]
}

export type EscalationGovernanceResult = {
  shouldEscalate: boolean
  immediate: boolean
  reason: string
  suggestedCategory:
    | "assistant_escalation"
    | "funding_dispute"
    | "withdrawal_dispute"
    | "crypto_dispute"
    | "payout_dispute"
    | "stuck_trade"
    | "settlement_failure"
    | "locked_balance"
    | "verification_complaint"
    | "operational_complaint"
}

export function evaluateAssistantEscalation(input: EscalationGovernanceInput): EscalationGovernanceResult {
  const msg = input.userMessage.trim()
  const prior = input.priorUserTurns ?? []
  const fundingPayoutTurns = [...prior, msg].filter((t) => FUNDING_PAYOUT_KEYWORDS.test(t)).length

  if (IMMEDIATE_ESCALATION_PATTERNS.some((re) => re.test(msg))) {
    return {
      shouldEscalate: true,
      immediate: true,
      reason: "financial_operational",
      suggestedCategory: categoryFromMessage(msg),
    }
  }

  if (detectHumanEscalationIntent(msg)) {
    return {
      shouldEscalate: true,
      immediate: true,
      reason: "human_assistance_requested",
      suggestedCategory: "assistant_escalation",
    }
  }

  // After 2+ unresolved funding/payout-related turns, escalate instead of looping.
  if (fundingPayoutTurns >= 3) {
    return {
      shouldEscalate: true,
      immediate: false,
      reason: "repeated_operational_topic",
      suggestedCategory: categoryFromMessage(msg),
    }
  }

  return {
    shouldEscalate: false,
    immediate: false,
    reason: "none",
    suggestedCategory: "assistant_escalation",
  }
}

function categoryFromMessage(msg: string): EscalationGovernanceResult["suggestedCategory"] {
  if (/\bwithdrawal|payout\b/i.test(msg)) return /\bpayout\b/i.test(msg) ? "payout_dispute" : "withdrawal_dispute"
  if (/\bcrypto|usdt|trc20\b/i.test(msg)) return "crypto_dispute"
  if (/\btrade|position\b/i.test(msg)) return "stuck_trade"
  if (/\bsettlement\b/i.test(msg)) return "settlement_failure"
  if (/\blocked\b/i.test(msg)) return "locked_balance"
  if (/\bverif/i.test(msg)) return "verification_complaint"
  if (/\bfunding|deposit\b/i.test(msg)) return "funding_dispute"
  return "operational_complaint"
}
