/**
 * Customer-facing platform vocabulary — UI copy only (not ledger columns or API fields).
 * Income → Session · Returns → Bullish Trades
 */

export const PLATFORM_TERM_SESSION = "Session"
export const PLATFORM_TERM_BULLISH_TRADES = "Bullish Trades"

/** Longer phrases first so partial replacements stay correct. */
const LABEL_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Session\s+Returns/gi, PLATFORM_TERM_BULLISH_TRADES],
  [/Returns\s+Available/gi, `${PLATFORM_TERM_BULLISH_TRADES} Available`],
  [/\bReturns\b/g, PLATFORM_TERM_BULLISH_TRADES],
  [/\bIncome\b/g, PLATFORM_TERM_SESSION],
]

/** Map legacy “earnings” customer labels to bullish-trades vocabulary where shown on dashboards. */
const EARNINGS_UI_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Session\s+earnings/gi, PLATFORM_TERM_BULLISH_TRADES],
  [/full\s+session\s+earnings/gi, `full ${PLATFORM_TERM_BULLISH_TRADES.toLowerCase()}`],
  [/Release\s+earnings/gi, `Release ${PLATFORM_TERM_BULLISH_TRADES.toLowerCase()}`],
  [/Scheduled\s+earnings/gi, `Scheduled ${PLATFORM_TERM_BULLISH_TRADES.toLowerCase()}`],
  [/accrued\s+earnings/gi, `accrued ${PLATFORM_TERM_BULLISH_TRADES.toLowerCase()}`],
  [/targeted\s+earnings/gi, `targeted ${PLATFORM_TERM_BULLISH_TRADES.toLowerCase()}`],
  [/How\s+earnings\s+show\s+up/gi, `How ${PLATFORM_TERM_BULLISH_TRADES.toLowerCase()} show up`],
  [/Earnings\s+\(display\)/gi, `${PLATFORM_TERM_BULLISH_TRADES} (display)`],
  [/Earnings\s+release/gi, `${PLATFORM_TERM_BULLISH_TRADES} release`],
  [/Lifetime\s+earnings/gi, `Lifetime ${PLATFORM_TERM_BULLISH_TRADES.toLowerCase()}`],
  [/Container\s+earnings/gi, `Container ${PLATFORM_TERM_BULLISH_TRADES.toLowerCase()}`],
  [/\bearnings\b/gi, PLATFORM_TERM_BULLISH_TRADES.toLowerCase()],
]

export function applyPlatformTerminology(label: string | null | undefined): string {
  if (label == null) return ""
  let out = String(label)
  for (const [re, rep] of LABEL_REPLACEMENTS) {
    out = out.replace(re, rep)
  }
  return out
}

/** Apply terminology plus earnings→bullish-trades phrasing for multi-sentence UI copy. */
export function applyPlatformCustomerCopy(text: string | null | undefined): string {
  if (text == null) return ""
  let out = applyPlatformTerminology(text)
  for (const [re, rep] of EARNINGS_UI_REPLACEMENTS) {
    out = out.replace(re, rep)
  }
  return out
}
