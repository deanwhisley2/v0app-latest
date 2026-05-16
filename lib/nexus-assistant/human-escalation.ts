const HUMAN_ESCALATION_PATTERNS: RegExp[] = [
  /\bhuman\s+assist/i,
  /\btalk\s+to\s+support\b/i,
  /\bcontact\s+support\b/i,
  /\breal\s+person\b/i,
  /\blive\s+support\b/i,
  /\bspeak\s+to\s+(someone|support|agent)\b/i,
  /\bescalat(e|ion)\b/i,
  /\bopen\s+(a\s+)?(ticket|case|thread)\b/i,
  /\bunresolved\s+(funding|withdrawal|deposit)\b/i,
  /\bfunding\s+(issue|problem|dispute)\b/i,
  /\bwithdrawal\s+(issue|problem|dispute)\b/i,
  /\bdispute\b/i,
  /\bappeal\b/i,
]

export function detectHumanEscalationIntent(message: string): boolean {
  const t = message.trim()
  if (!t) return false
  return HUMAN_ESCALATION_PATTERNS.some((re) => re.test(t))
}
