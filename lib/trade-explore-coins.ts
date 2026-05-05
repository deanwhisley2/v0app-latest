import type { Coin } from "@/lib/coins-data"

function rnd(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233 + 42) * 43758.5453
  return x - Math.floor(x)
}

const BASE_TICKERS = [
  "PEPE", "WIF", "BONK", "FLOKI", "NOT", "ETHFI", "ENA", "W", "STRK", "DYM", "ALT", "JUP", "PYTH", "TIA",
  "SEI", "SUI", "ARKM", "BIGTIME", "BLUR", "MEME", "ORDI", "STG", "RDNT", "HFT", "ID", "HOOK", "MAGIC",
  "HIGH", "GMX", "PERP", "LQTY", "FXS", "RPL", "SSV", "LDO", "RNDR", "FET", "AGIX", "OCEAN", "NMR", "GRT",
  "IMX", "OP", "ARB", "MATIC", "AVAX", "NEAR", "FTM", "ONE", "ROSE", "IOTX", "CELR", "SKL", "ANKR", "ZIL",
  "HOT", "BAT", "ZRX", "KNC", "LRC", "STORJ", "MANA", "SAND", "ENJ", "GALA", "ILV", "ALICE", "TLM", "CHR",
  "SUPER", "PYR", "ALCX", "CVX", "SPELL", "MIM", "TRIBE", "FEI", "FRAX", "LUSD", "SUSD", "GUSD",
  "USTC", "ANC", "MIR", "ORION", "ASTR", "MOVR", "GLMR", "ACA", "KSM", "DOT", "OSMO", "JUNO", "SCRT", "STARS",
] as const

function synth(symbol: string, seed: number, mode: "new" | "trend"): Coin {
  const r = (k: number) => rnd(seed, k + (mode === "new" ? 17 : 0))
  const price =
    mode === "new"
      ? Math.max(0.000012, 10 ** (r(1) * 3.2 - 2.4))
      : Math.max(0.0001, 10 ** (r(1) * 4.8 - 0.5))
  const change24h =
    mode === "new"
      ? 6 + r(2) * 140
      : (r(2) - 0.38) * 85
  const change7d = change24h * (0.4 + r(3) * 1.2)
  const volume = Math.floor(1e6 + r(4) * 9e8 * (mode === "new" ? 0.35 : 1))
  const marketCap = Math.floor(volume * (8 + r(5) * 40))
  const hue = Math.floor((seed * 47 + (mode === "new" ? 20 : 0)) % 360)
  const color = `hsl(${hue} 65% 52%)`
  const name =
    mode === "new"
      ? `${symbol} · New`
      : `${symbol} · Spot`
  return { symbol, name, price, change24h, change7d, volume, marketCap, color }
}

/** ~100 trending symbols (24h movers), deterministic. */
export function buildTrendingCoinList(count = 100): Coin[] {
  const out: Coin[] = []
  for (let i = 0; i < count; i++) {
    const base = BASE_TICKERS[i % BASE_TICKERS.length]
    const symbol = i < BASE_TICKERS.length ? base : `${base}${1 + Math.floor(i / BASE_TICKERS.length)}`
    out.push(synth(symbol, i + 900, "trend"))
  }
  return out.sort((a, b) => b.change24h - a.change24h)
}

/** Recently listed style coins (positive bias). */
export function buildNewCoinList(count = 28): Coin[] {
  const out: Coin[] = []
  for (let i = 0; i < count; i++) {
    const base = BASE_TICKERS[(i * 7 + 3) % BASE_TICKERS.length]
    const symbol = `N${base}${i > BASE_TICKERS.length ? Math.floor(i / 3) : ""}`.slice(0, 14)
    out.push(synth(symbol, i + 3000, "new"))
  }
  return out.sort((a, b) => b.volume - a.volume)
}
