/**
 * End-to-end smoke: Binance fast paths + xAI Grok (same stack as POST /api/analysis/time-bound).
 * Loads secrets from .env.local (gitignored).
 *
 * Usage:
 *   npx tsx scripts/run-time-bound-full-analysis.ts
 *   npx tsx scripts/run-time-bound-full-analysis.ts BTC
 *   npx tsx scripts/run-time-bound-full-analysis.ts ETH
 *
 * "BTC" → BTCUSDT on Binance. Plain "USDT" is not a spot pair; use a base like BTC/SOL.
 */
import { config } from "dotenv"
import { resolve } from "node:path"

config({ path: resolve(process.cwd(), ".env.local") })

async function main() {
  const raw = (process.argv[2] || "BTC").trim()
  const symbol = raw.toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTC"

  if (symbol === "USDT") {
    console.warn(
      "[smoke] Symbol 'USDT' alone is not a Binance spot pair for depth/funding. Using BTC (BTCUSDT) instead.\n"
    )
  }

  const sym = symbol === "USDT" ? "BTC" : symbol

  const { timeBoundAnalysis } = await import("../lib/analysis/time-bound-analysis")

  console.log("[smoke] Starting time-bound analysis …")
  const { toBinanceSymbol } = await import("../lib/server/fast-paths-core")
  console.log("[smoke] Base symbol:", sym, "| Binance pair:", toBinanceSymbol(sym))
  console.log("[smoke] XAI_API_KEY set:", Boolean(process.env.XAI_API_KEY?.trim()))
  console.log("[smoke] XAI_MODEL:", process.env.XAI_MODEL || "(default grok-4.3)")
  console.log("[smoke] timeWindow: 120s (room for reasoning model)\n")

  const result = await timeBoundAnalysis.startAnalysis({
    symbol: sym,
    timeWindowMs: 120_000,
    includeGrok: true,
    onPartialResult: (p) => {
      console.log(
        `[partial] ${p.phase} · waitingGrok=${p.waitingForGrok} · remainingMs=${p.timeRemainingMs}` +
          (p.grokResult ? ` · grok.mock=${p.grokResult.mock}` : "")
      )
    },
    onFinalResult: (f) => {
      console.log(
        `[final] ${f.symbol} ${f.fusedDecision.action} (${f.fusedDecision.confidence}%) grokReceived=${f.grokReceived} grokInfluenced=${f.fusedDecision.grokInfluenced}`
      )
    },
  })

  console.log("\n--- RESULT (summary) ---")
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
