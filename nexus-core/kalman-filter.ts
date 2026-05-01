// OUR KALMAN FILTER - Predicts price before it moves
// This is our secret weapon. While others react, WE PREDICT.

export interface PredictionResult {
  predictedPrice: number
  currentPrice: number
  signal: "BULLISH" | "BEARISH" | "NEUTRAL"
  strength: number
  deviation: number
}

export class KalmanFilter {
  private Q: number = 0.001
  private R: number = 0.01
  private P: number = 1.0
  private K: number = 0.0
  private x: number = 0.0
  private initialized: boolean = false

  fit(historicalPrices: number[]): void {
    if (historicalPrices.length === 0) return
    this.x = historicalPrices[0]
    this.initialized = true
    this.P = 1.0
    for (let i = 1; i < Math.min(historicalPrices.length, 100); i++) {
      this.update(historicalPrices[i])
    }
  }

  update(observedPrice: number): PredictionResult {
    if (!this.initialized) {
      this.x = observedPrice
      this.initialized = true
      return {
        predictedPrice: observedPrice,
        currentPrice: observedPrice,
        signal: "NEUTRAL",
        strength: 0,
        deviation: 0
      }
    }

    this.P = this.P + this.Q
    this.K = this.P / (this.P + this.R)
    this.x = this.x + this.K * (observedPrice - this.x)
    this.P = (1 - this.K) * this.P

    const deviation = ((this.x - observedPrice) / observedPrice) * 100
    
    let signal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL"
    let strength = 0
    
    if (deviation > 0.15) {
      signal = "BULLISH"
      strength = Math.min(deviation * 3, 100)
    } else if (deviation < -0.15) {
      signal = "BEARISH"
      strength = Math.min(Math.abs(deviation) * 3, 100)
    }

    return {
      predictedPrice: this.x,
      currentPrice: observedPrice,
      signal,
      strength,
      deviation
    }
  }

  reset(): void {
    this.P = 1.0
    this.K = 0.0
    this.x = 0.0
    this.initialized = false
  }
}