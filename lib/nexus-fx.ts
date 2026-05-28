/**
 * FX helpers: USD is the internal accounting unit; local amounts use “local currency units per 1 USD”.
 * Configure via env NEXUS_FX_LOCAL_PER_USD_JSON — example: {"UGX":3900,"KES":130}
 * Meaning: 1 USD == 3900 UGX (user pays ~19,500 UGX for a $5 minimum deposit).
 */

import { USD_TO_FX, type FiatCurrencyCode } from "@/lib/currency-display"
import {
  NEXUS_MIN_DEPOSIT_USD,
  NEXUS_MIN_WITHDRAW_USD,
  roundUsd2,
} from "@/lib/nexus-financial-policy"

export type FxLocalPerUsdMap = Record<string, number>

let cachedMap: FxLocalPerUsdMap | null = null

export function readFxLocalPerUsdMap(): FxLocalPerUsdMap {
  if (cachedMap) return cachedMap
  const raw = process.env.NEXUS_FX_LOCAL_PER_USD_JSON ?? "{}"
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: FxLocalPerUsdMap = {}
    for (const [k, v] of Object.entries(parsed)) {
      const code = k.trim().toUpperCase()
      const n = Number(v)
      if (code && Number.isFinite(n) && n > 0) out[code] = n
    }
    cachedMap = out
    return out
  } catch {
    cachedMap = {}
    return {}
  }
}

/** Convert local currency units to USD using ISO 4217 code (e.g. UGX). */
export function localUnitsToUsd(amountLocal: number, currencyCode: string): number | null {
  const code = currencyCode.trim().toUpperCase()
  const envMap = readFxLocalPerUsdMap()
  const rate = envMap[code] ?? USD_TO_FX[code as FiatCurrencyCode]
  if (!rate || !Number.isFinite(amountLocal)) return null
  return roundUsd2(amountLocal / rate)
}

/** Convert USD to local currency units for display / limits messaging. */
export function usdToLocalUnits(usd: number, currencyCode: string): number | null {
  const code = currencyCode.trim().toUpperCase()
  const envMap = readFxLocalPerUsdMap()
  const rate = envMap[code] ?? USD_TO_FX[code as FiatCurrencyCode]
  if (!rate) return null
  return Math.round(usd * rate * 100) / 100
}

export function minDepositUsdOk(amountUsd: number): boolean {
  return Number.isFinite(amountUsd) && amountUsd >= NEXUS_MIN_DEPOSIT_USD - 1e-9
}

/** Minimum withdrawal in USD-equivalent policy floor. */
export function minWithdrawUsdFloor(): number {
  return roundUsd2(NEXUS_MIN_WITHDRAW_USD)
}

export function minWithdrawUsdOk(amountUsd: number): boolean {
  const floor = minWithdrawUsdFloor()
  return Number.isFinite(amountUsd) && amountUsd >= floor - 1e-9
}
