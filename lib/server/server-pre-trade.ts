/**
 * Minimal pre-trade checks for server-side real execution (no "use client" deps).
 */

export function serverPreTradeValidate(input: {
  symbol: string
  action: "buy" | "sell"
  quantity: number
  price: number
  portfolioUsd: number
  rsi?: number
  /** If set with price, max loss to stop ≈ quantity × |price − stopLoss| must be ≤ maxRiskUsd */
  stopLoss?: number
  maxRiskUsd?: number
}): { ok: true } | { ok: false; reason: string } {
  const { quantity, price, portfolioUsd, action, rsi, stopLoss, maxRiskUsd } = input
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, reason: "Invalid quantity" }
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "Invalid price" }
  if (!Number.isFinite(portfolioUsd) || portfolioUsd <= 0) return { ok: false, reason: "Invalid portfolio" }

  const notional = quantity * price
  if (notional > portfolioUsd + 1e-6) {
    return { ok: false, reason: `Notional $${notional.toFixed(2)} exceeds portfolio $${portfolioUsd}` }
  }

  const capRisk = maxRiskUsd ?? Math.min(0.4, portfolioUsd * 0.02)
  if (stopLoss !== undefined && Number.isFinite(stopLoss) && capRisk > 0) {
    const lossPerUnit = action === "buy" ? Math.max(0, price - stopLoss) : Math.max(0, stopLoss - price)
    const estRisk = quantity * lossPerUnit
    if (estRisk > capRisk + 1e-6) {
      return {
        ok: false,
        reason: `Estimated risk at stop $${estRisk.toFixed(2)} exceeds cap $${capRisk.toFixed(2)}`,
      }
    }
  }

  if (rsi !== undefined && Number.isFinite(rsi)) {
    if (action === "buy" && rsi > 78) return { ok: false, reason: "RSI too high for BUY" }
    if (action === "sell" && rsi < 22) return { ok: false, reason: "RSI too low for SELL" }
  }

  return { ok: true }
}
