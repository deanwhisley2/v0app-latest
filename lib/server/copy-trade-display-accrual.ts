import { roundUsd2 } from "@/lib/nexus-financial-policy"

/**
 * Sub-cent display motion under the lifecycle gross cap — deterministic from session + 30s time bucket
 * (server-only; never exceeds `capUsd`).
 */
export function copyTradeDisplayAccruedGrossUsd(
  sessionId: string,
  accruedGrossUsd: number,
  capUsd: number,
  now = new Date(),
): number {
  const bucket = Math.floor(now.getTime() / 30_000)
  let h = 2166136261 >>> 0
  const s = `${sessionId}|${bucket}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const noise = ((h >>> 0) % 2000) / 100_000
  const bumped = roundUsd2(accruedGrossUsd + noise)
  return roundUsd2(Math.min(roundUsd2(capUsd), bumped))
}
