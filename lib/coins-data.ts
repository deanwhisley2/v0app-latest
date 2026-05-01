export interface Coin {
  symbol: string
  name: string
  price: number
  change24h: number
  change7d: number
  volume: number
  marketCap: number
  color: string
}

export const coinsData: Coin[] = [
  { symbol: "BTC", name: "Bitcoin", price: 76779.9, change24h: 2.53, change7d: 5.2, volume: 15600000000, marketCap: 1480000000000, color: "#F7931A" },
  { symbol: "ETH", name: "Ethereum", price: 2288.26, change24h: 1.45, change7d: 3.1, volume: 8900000000, marketCap: 275000000000, color: "#627EEA" },
  { symbol: "LUNC", name: "Terra Classic", price: 0.04613, change24h: 18.16, change7d: 22.4, volume: 2100000, marketCap: 268000000, color: "#FFD83D" },
  { symbol: "ORCA", name: "Orca", price: 1.24, change24h: 15.23, change7d: 8.1, volume: 890000, marketCap: 62000000, color: "#FFD15C" },
  { symbol: "CFX", name: "Conflux", price: 0.087, change24h: 11.47, change7d: 4.3, volume: 5400000, marketCap: 320000000, color: "#1E1E1E" },
  { symbol: "SOL", name: "Solana", price: 156.32, change24h: 8.92, change7d: 5.6, volume: 234000000, marketCap: 68000000000, color: "#9945FF" },
  { symbol: "KCS", name: "KuCoin Token", price: 8.45, change24h: 6.31, change7d: 1.2, volume: 12100000, marketCap: 810000000, color: "#0093DD" },
  { symbol: "AVAX", name: "Avalanche", price: 22.45, change24h: 5.87, change7d: 8.3, volume: 345000000, marketCap: 8900000000, color: "#E84142" },
  { symbol: "LINK", name: "Chainlink", price: 14.23, change24h: 4.56, change7d: 6.2, volume: 456000000, marketCap: 8300000000, color: "#2A5ADA" },
  { symbol: "DOT", name: "Polkadot", price: 4.12, change24h: 3.89, change7d: 2.1, volume: 123000000, marketCap: 5400000000, color: "#E6007A" },
  { symbol: "MATIC", name: "Polygon", price: 0.38, change24h: 3.45, change7d: 5.8, volume: 234000000, marketCap: 3500000000, color: "#8247E5" },
  { symbol: "ADA", name: "Cardano", price: 0.45, change24h: 2.78, change7d: 4.2, volume: 345000000, marketCap: 15800000000, color: "#0033AD" },
  { symbol: "XRP", name: "Ripple", price: 0.52, change24h: 2.34, change7d: 3.1, volume: 890000000, marketCap: 28000000000, color: "#23292F" },
  { symbol: "DOGE", name: "Dogecoin", price: 0.082, change24h: 1.92, change7d: 2.8, volume: 456000000, marketCap: 11500000000, color: "#C2A633" },
  { symbol: "SHIB", name: "Shiba Inu", price: 0.0000089, change24h: 1.56, change7d: 1.2, volume: 234000000, marketCap: 5200000000, color: "#F00500" },
  { symbol: "UNI", name: "Uniswap", price: 6.23, change24h: 1.23, change7d: 2.4, volume: 123000000, marketCap: 3700000000, color: "#FF007A" },
  { symbol: "ATOM", name: "Cosmos", price: 4.56, change24h: 0.89, change7d: 1.5, volume: 89000000, marketCap: 1300000000, color: "#2E3148" },
  { symbol: "LTC", name: "Litecoin", price: 68.45, change24h: 0.67, change7d: 1.2, volume: 234000000, marketCap: 5100000000, color: "#345D9D" },
  { symbol: "BCH", name: "Bitcoin Cash", price: 234.56, change24h: 0.45, change7d: 0.8, volume: 123000000, marketCap: 4600000000, color: "#8DC351" },
  { symbol: "TRX", name: "TRON", price: 0.089, change24h: 0.23, change7d: 0.5, volume: 345000000, marketCap: 7800000000, color: "#FF0013" },
  { symbol: "NEAR", name: "NEAR Protocol", price: 2.34, change24h: 0.12, change7d: 0.3, volume: 89000000, marketCap: 2500000000, color: "#00C08B" },
  { symbol: "APE", name: "ApeCoin", price: 0.1432, change24h: -0.38, change7d: -1.2, volume: 34200000, marketCap: 86000000, color: "#0052FF" },
  { symbol: "FTM", name: "Fantom", price: 0.34, change24h: -0.56, change7d: -1.5, volume: 67000000, marketCap: 950000000, color: "#1969FF" },
  { symbol: "ALGO", name: "Algorand", price: 0.118, change24h: -0.78, change7d: -2.1, volume: 23400000, marketCap: 960000000, color: "#000000" },
  { symbol: "VET", name: "VeChain", price: 0.023, change24h: -1.12, change7d: -2.5, volume: 45000000, marketCap: 1700000000, color: "#15BDFF" },
  { symbol: "SAND", name: "The Sandbox", price: 0.28, change24h: -1.45, change7d: -3.2, volume: 56000000, marketCap: 640000000, color: "#00ADEF" },
  { symbol: "MANA", name: "Decentraland", price: 0.31, change24h: -1.78, change7d: -3.8, volume: 67000000, marketCap: 590000000, color: "#FF2D55" },
  { symbol: "AXS", name: "Axie Infinity", price: 4.56, change24h: -2.12, change7d: -4.2, volume: 34000000, marketCap: 560000000, color: "#0055D5" },
  { symbol: "GALA", name: "Gala", price: 0.018, change24h: -2.34, change7d: -4.8, volume: 78000000, marketCap: 520000000, color: "#000000" },
  { symbol: "ENJ", name: "Enjin Coin", price: 0.18, change24h: -2.56, change7d: -5.2, volume: 23000000, marketCap: 180000000, color: "#624DBF" },
  { symbol: "CHZ", name: "Chiliz", price: 0.052, change24h: -2.78, change7d: -5.8, volume: 45000000, marketCap: 460000000, color: "#CD0124" },
  { symbol: "FLOW", name: "Flow", price: 0.45, change24h: -3.12, change7d: -6.2, volume: 34000000, marketCap: 680000000, color: "#00EF8B" },
  { symbol: "HBAR", name: "Hedera", price: 0.052, change24h: -3.45, change7d: -6.8, volume: 56000000, marketCap: 1800000000, color: "#000000" },
  { symbol: "XTZ", name: "Tezos", price: 0.67, change24h: -3.78, change7d: -7.2, volume: 23000000, marketCap: 630000000, color: "#2C7DF7" },
  { symbol: "THETA", name: "Theta Network", price: 0.89, change24h: -4.12, change7d: -7.8, volume: 34000000, marketCap: 890000000, color: "#2AB8E6" },
  { symbol: "EOS", name: "EOS", price: 0.56, change24h: -4.45, change7d: -8.2, volume: 45000000, marketCap: 640000000, color: "#000000" },
  { symbol: "TRUMP", name: "Official Trump", price: 2.522, change24h: -4.72, change7d: -15.3, volume: 45000000, marketCap: 252000000, color: "#FF0000" },
  { symbol: "AAVE", name: "Aave", price: 89.45, change24h: -5.12, change7d: -8.8, volume: 67000000, marketCap: 1300000000, color: "#B6509E" },
  { symbol: "MKR", name: "Maker", price: 1234.56, change24h: -5.45, change7d: -9.2, volume: 34000000, marketCap: 1100000000, color: "#1AAB9B" },
  { symbol: "COMP", name: "Compound", price: 45.67, change24h: -5.78, change7d: -9.8, volume: 23000000, marketCap: 370000000, color: "#00D395" },
  { symbol: "SNX", name: "Synthetix", price: 1.23, change24h: -6.12, change7d: -10.2, volume: 34000000, marketCap: 400000000, color: "#00D1FF" },
  { symbol: "CRV", name: "Curve DAO", price: 0.34, change24h: -6.45, change7d: -10.8, volume: 45000000, marketCap: 410000000, color: "#40649F" },
  { symbol: "1INCH", name: "1inch", price: 0.28, change24h: -6.78, change7d: -11.2, volume: 23000000, marketCap: 310000000, color: "#94A6C3" },
  { symbol: "BAL", name: "Balancer", price: 2.34, change24h: -7.12, change7d: -11.8, volume: 12000000, marketCap: 140000000, color: "#1E1E1E" },
  { symbol: "YFI", name: "yearn.finance", price: 5678.90, change24h: -7.45, change7d: -12.2, volume: 23000000, marketCap: 190000000, color: "#006AE3" },
  { symbol: "SUSHI", name: "SushiSwap", price: 0.56, change24h: -7.78, change7d: -12.8, volume: 34000000, marketCap: 140000000, color: "#FA52A0" },
  { symbol: "ENSO", name: "Enso", price: 0.8922, change24h: -8.32, change7d: -12.4, volume: 2100000, marketCap: 44600000, color: "#6366F1" },
  { symbol: "MASK", name: "Mask Network", price: 0.526, change24h: -10.51, change7d: -18.7, volume: 8900000, marketCap: 52600000, color: "#1C68F3" },
  { symbol: "STO", name: "StakeStone", price: 0.08711, change24h: -11.78, change7d: -16.3, volume: 1200000, marketCap: 8710000, color: "#00CED1" },
  { symbol: "D", name: "DAR Open Network", price: 0.01288, change24h: -18.11, change7d: -25.0, volume: 3400000, marketCap: 12880000, color: "#FFD700" },
  { symbol: "LAB", name: "Lab", price: 0.60134, change24h: -25.35, change7d: -30.2, volume: 1500000, marketCap: 30000000, color: "#8B5CF6" },
  { symbol: "ZBT", name: "Zerobase", price: 0.18422, change24h: -28.37, change7d: -35.1, volume: 3200000, marketCap: 18400000, color: "#EF4444" },
]

export function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } else if (price >= 1) {
    return price.toFixed(2)
  } else if (price >= 0.0001) {
    return price.toFixed(4)
  } else {
    return price.toFixed(8)
  }
}

export function formatVolume(volume: number): string {
  if (volume >= 1e9) {
    return `$${(volume / 1e9).toFixed(2)}B`
  } else if (volume >= 1e6) {
    return `$${(volume / 1e6).toFixed(2)}M`
  } else if (volume >= 1e3) {
    return `$${(volume / 1e3).toFixed(2)}K`
  }
  return `$${volume.toFixed(2)}`
}

export function formatMarketCap(marketCap: number): string {
  if (marketCap >= 1e12) {
    return `$${(marketCap / 1e12).toFixed(2)}T`
  } else if (marketCap >= 1e9) {
    return `$${(marketCap / 1e9).toFixed(2)}B`
  } else if (marketCap >= 1e6) {
    return `$${(marketCap / 1e6).toFixed(2)}M`
  }
  return `$${marketCap.toFixed(2)}`
}

export function getSortedCoins(coins: Coin[], sortBy: 'change24h' | 'change7d' | 'volume' | 'marketCap' = 'change24h', order: 'asc' | 'desc' = 'desc'): Coin[] {
  return [...coins].sort((a, b) => {
    const aVal = a[sortBy]
    const bVal = b[sortBy]
    return order === 'desc' ? bVal - aVal : aVal - bVal
  })
}

export function getTopGainers(coins: Coin[], limit = 5): Coin[] {
  return getSortedCoins(coins, 'change24h', 'desc').slice(0, limit)
}

export function getTopLosers(coins: Coin[], limit = 5): Coin[] {
  return getSortedCoins(coins, 'change24h', 'asc').slice(0, limit)
}
