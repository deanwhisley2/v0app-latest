import type { AutoTraderConfig, JoelinCoin, Position } from "@/lib/expert/phase2-types"

export class AutoTraderEngine {
  constructor(private readonly config: AutoTraderConfig) {}

  async tick(fetchJoelinData: () => Promise<JoelinCoin[]>) {
    if (this.shouldStop()) return this.cooldownOrAbort()
    const coins = await fetchJoelinData()
    const ranked = this.rankCoins(coins)
    for (const coin of ranked) {
      await this.handleCoin(coin)
    }
    await this.rebalanceIfNeeded()
    return { status: "ok", activePositions: this.config.activePositions.size }
  }

  private rankCoins(coins: JoelinCoin[]): JoelinCoin[] {
    return coins
      .filter(
        (c) =>
          c.focusMember === true &&
          c.minuteTradeConfirmed === true &&
          c.confidence >= 65 &&
          c.safetyLevel !== "LOW"
      )
      .sort((a, b) => {
        const supervisionA = a.supervisionLevel === "CRITICAL" ? 18 : a.supervisionLevel === "HIGH" ? 8 : 0
        const supervisionB = b.supervisionLevel === "CRITICAL" ? 18 : b.supervisionLevel === "HIGH" ? 8 : 0
        const scoreA = a.confidence * 0.5 + a.tradableLevel * 0.4 + supervisionA
        const scoreB = b.confidence * 0.5 + b.tradableLevel * 0.4 + supervisionB
        return scoreB - scoreA
      })
  }

  private async handleCoin(coin: JoelinCoin) {
    const position = this.config.activePositions.get(coin.symbol)
    if (!position && this.canOpenNewPosition(coin)) {
      await this.openPosition(coin)
    } else if (position && this.shouldClosePosition(position, coin)) {
      await this.closePosition(position)
    } else if (position && this.canAddToPosition(position, coin)) {
      await this.addToPosition(position, coin)
    }
  }

  private canOpenNewPosition(_coin: JoelinCoin): boolean {
    const now = new Date()
    const minutesSinceLastEntry = (now.getTime() - this.config.lastEntryTime.getTime()) / 60_000
    return (
      this.config.usedBalance < this.config.totalBalance &&
      minutesSinceLastEntry >= 5 &&
      this.config.consecutiveLosses < 2 &&
      this.config.dailyLoss < 4
    )
  }

  private shouldClosePosition(position: Position, currentSignal: JoelinCoin): boolean {
    if (position.status !== "active") return false
    const isReversal =
      (position.pnlPercent > 0 && currentSignal.action === "SELL") ||
      (position.pnlPercent < 0 && currentSignal.action === "BUY")
    return isReversal && currentSignal.confidence >= 70
  }

  private canAddToPosition(_position: Position, coin: JoelinCoin): boolean {
    return this.config.usedBalance + 1 <= this.config.totalBalance && coin.confidence >= 75
  }

  private async openPosition(coin: JoelinCoin) {
    const size = Math.max(1, Math.min(25, this.config.totalBalance - this.config.usedBalance))
    if (size < 1) return
    const p: Position = {
      symbol: coin.symbol,
      entryPrice: coin.price,
      quantity: size / Math.max(coin.price, 0.0000001),
      investedAmount: size,
      currentPrice: coin.price,
      pnl: 0,
      pnlPercent: 0,
      entryTime: new Date(),
      status: "active",
      strategy: "joelin_rank",
    }
    this.config.activePositions.set(coin.symbol, p)
    this.config.usedBalance += size
    this.config.lastEntryTime = new Date()
  }

  private async closePosition(position: Position) {
    position.status = "closed"
    this.config.activePositions.delete(position.symbol)
    this.config.usedBalance = Math.max(0, this.config.usedBalance - position.investedAmount)
  }

  private async addToPosition(position: Position, coin: JoelinCoin) {
    const addAmount = 1
    position.investedAmount += addAmount
    position.quantity += addAmount / Math.max(coin.price, 0.0000001)
    position.currentPrice = coin.price
    this.config.usedBalance += addAmount
  }

  private async rebalanceIfNeeded() {
    // Reserved for multi-coin rebalance phase.
  }

  private shouldStop() {
    if (this.config.runtimeMinutes === 0) return false
    return false
  }

  private cooldownOrAbort() {
    return { status: "cooldown" as const }
  }
}
