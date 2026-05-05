export type ExchangePreCheckResult = {
  valid: true
  availableUSDT: number
  minAmount: number
}

export async function validateExchange(userId: string, symbol: string, amount: number): Promise<ExchangePreCheckResult> {
  const minAmount = 1
  if (!userId) {
    throw new Error("AUTH_REQUIRED")
  }
  if (!symbol.endsWith("USDT")) {
    throw new Error("UNSUPPORTED_SYMBOL_PAIR")
  }
  // TODO: wire real exchange account permission checks.
  const spotTradingEnabled = true
  const marginTradingEnabled = true
  const availableUSDT = 10_000
  const remainingRate = 50

  if (!spotTradingEnabled) {
    throw new Error("EXCHANGE_SPOT_TRADING_DISABLED")
  }
  if (!marginTradingEnabled) {
    // non-fatal according to spec (warn only)
    console.warn("Margin trading disabled - spot only")
  }
  if (amount < minAmount) {
    throw new Error(`MIN_ORDER_SIZE: Need at least $${minAmount}`)
  }
  if (availableUSDT < amount) {
    throw new Error(`INSUFFICIENT_BALANCE: Have $${availableUSDT}, need $${amount}`)
  }
  if (remainingRate < 5) {
    throw new Error("RATE_LIMIT_APPROACHING: Pausing 60 seconds")
  }
  return { valid: true, availableUSDT, minAmount }
}
