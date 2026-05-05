/**
 * Trading UI tier for the dashboard (1 = view, 2 = trader, 3 = full desk).
 * Guest and signed-in users share this until Supabase tiering is wired again.
 */
export const TRADING_USER_LEVEL = 3 as const

export type TradingUserLevel = typeof TRADING_USER_LEVEL
