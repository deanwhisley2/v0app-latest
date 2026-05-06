import { binanceAccountInfo, binanceExchangeInfo } from "@/lib/server/binance-signed-order"
import type { BinanceCreds } from "@/lib/expert/user-binance"

export type ExchangePreCheckResult = {
  valid: true
  availableUSDT: number
  minAmount: number
  stepSize?: number
  minQty?: number
}

function hasSpotPermission(permissions: string[] | undefined): boolean {
  if (!Array.isArray(permissions)) return false
  return permissions.some((p) => p === "SPOT" || p.startsWith("TRD_GRP_"))
}

function resolveMinNotional(symbolFilters: Array<{ filterType: string; minNotional?: string }> | undefined): {
  value: number
  source: "NOTIONAL" | "MIN_NOTIONAL" | "fallback"
} {
  const notionalFilter = symbolFilters?.find((f) => f.filterType === "NOTIONAL")
  const minNotionalFromNotional = Number.parseFloat(notionalFilter?.minNotional ?? "")
  if (Number.isFinite(minNotionalFromNotional)) {
    return { value: minNotionalFromNotional, source: "NOTIONAL" }
  }

  const minNotionalFilter = symbolFilters?.find((f) => f.filterType === "MIN_NOTIONAL")
  const minNotionalFromLegacy = Number.parseFloat(minNotionalFilter?.minNotional ?? "")
  if (Number.isFinite(minNotionalFromLegacy)) {
    return { value: minNotionalFromLegacy, source: "MIN_NOTIONAL" }
  }

  return { value: 10, source: "fallback" }
}

export async function validateExchange(
  binance: BinanceCreds,
  symbol: string,
  amount: number
): Promise<ExchangePreCheckResult> {
  const minAmount = 1
  if (!symbol.endsWith("USDT")) {
    throw new Error("UNSUPPORTED_SYMBOL_PAIR")
  }

  const [account, exchangeInfo] = await Promise.all([
    binanceAccountInfo(binance.apiKey, binance.apiSecret),
    binanceExchangeInfo(symbol),
  ])
  const spotTradingEnabled = hasSpotPermission(account.permissions)
  console.log(
    `[exchange-precheck] permissions=${JSON.stringify(account.permissions ?? [])} · hasSpotPermission=${spotTradingEnabled}`
  )
  if (!spotTradingEnabled) {
    throw new Error("EXCHANGE_SPOT_TRADING_DISABLED")
  }

  const usdtBalance = account.balances.find((b) => b.asset === "USDT")?.free ?? "0"
  const availableUSDT = Number.parseFloat(usdtBalance)
  if (!Number.isFinite(availableUSDT)) {
    throw new Error("BALANCE_PARSE_FAILED")
  }

  const symbolInfo = exchangeInfo.symbols?.find((s) => s.symbol === symbol)
  if (!symbolInfo || symbolInfo.status !== "TRADING") {
    throw new Error("SYMBOL_NOT_TRADABLE")
  }
  const lotSizeFilter = symbolInfo.filters?.find((f) => f.filterType === "LOT_SIZE")
  const marketLotSizeFilter = symbolInfo.filters?.find((f) => f.filterType === "MARKET_LOT_SIZE")
  const resolvedNotional = resolveMinNotional(symbolInfo.filters)
  const minNotional = resolvedNotional.value
  const minQty = Number.parseFloat(lotSizeFilter?.minQty ?? "0")
  const stepSize = Number.parseFloat(lotSizeFilter?.stepSize ?? "0")
  console.log(
    `[exchange-precheck] filters=${JSON.stringify(symbolInfo.filters ?? [])} · notionalSource=${resolvedNotional.source} · minNotional=${minNotional} · lotSize(minQty=${lotSizeFilter?.minQty ?? "n/a"},stepSize=${lotSizeFilter?.stepSize ?? "n/a"}) · marketLotSize(minQty=${marketLotSizeFilter?.minQty ?? "n/a"},stepSize=${marketLotSizeFilter?.stepSize ?? "n/a"})`
  )

  if (amount < minAmount) {
    throw new Error(`MIN_ORDER_SIZE: Need at least $${minAmount}`)
  }
  if (Number.isFinite(minNotional) && amount < minNotional) {
    throw new Error(`MIN_NOTIONAL: Need at least $${minNotional}`)
  }
  if (availableUSDT < amount) {
    throw new Error(`INSUFFICIENT_BALANCE: Have $${availableUSDT}, need $${amount}`)
  }
  return {
    valid: true,
    availableUSDT,
    minAmount: Number.isFinite(minNotional) ? Math.max(minAmount, minNotional) : minAmount,
    minQty: Number.isFinite(minQty) ? minQty : undefined,
    stepSize: Number.isFinite(stepSize) ? stepSize : undefined,
  }
}
