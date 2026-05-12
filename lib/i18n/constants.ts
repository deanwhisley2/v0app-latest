/**
 * UI / product copy canonical language. Ledger, APIs, audit logs, and treasury
 * strings stay English (or machine-oriented) in code — never branch financial
 * math on translated text.
 */
export const CANONICAL_UI_LANGUAGE = "en" as const
