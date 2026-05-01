# NEX Tri-Model Trading System

## Overview

The NEX Trading Bot uses a **non-consensus research model** combining three specialized AI co-pilots: **Gemini**, **Grok**, and **ChatGPT**. Instead of giving conflicting signals, they work as a diverse team of specialized analysts providing a 360-degree market view.

## The Three Specialists

### 1. **Gemini: The Quant Data Miner** 📊
**Role**: Macro analysis and institutional data ingestion

- Analyzes central bank policies, earnings data, on-chain metrics
- Connects macro trends to specific trading opportunities
- Ingests multimodal data (PDFs, transcripts, charts)
- Provides institutional sentiment indicators
- **Confidence Score**: 0-100% (how certain is the macro outlook)

**Example Insights**:
- "Fed rate expectations: 4.5% by Q2"
- "BTC correlation to gold: +0.73"
- "Institutional inflows up 24% YTD"
- "On-chain whale movements: bullish positioning"

---

### 2. **Grok: The Sentiment Specialist** 🐦
**Role**: Real-time social sentiment and viral trends

- Real-time access to X (Twitter) for trending hashtags
- Detects retail sentiment shifts instantly
- Monitors viral crypto narratives and hype
- Crucial for headline-driven and retail-driven markets
- **Urgency Levels**: High, Medium, Low

**Example Insights**:
- Viral hashtag #BTC-rally with 1.2M mentions
- Sentiment breakdown: 85% Bullish, 12% Neutral, 3% Bearish
- Major influencers calling for breakout
- Fear/Greed index spiking

---

### 3. **ChatGPT: The Strategy Coder** ⚙️
**Role**: Execution logic and backtesting

- Backtests strategies against historical data
- Generates Python/Pine Script execution code
- Calculates win rates and risk-adjusted returns
- Provides step-by-step trade execution plan
- **Win Rate**: Historical backtest success percentage

**Example Insights**:
```python
if close > ma20 and rsi < 70 and volume > avg_vol:
    BUY
```

Execution steps:
1. Entry: 5% above current price (breakout confirmation)
2. Position size: 0.5x account per signal
3. Take profit: +3%, +5%, +8% exits (scaled)
4. Stop loss: -2% tight stop below support

---

## The Consensus Model

### Why All Three?

If everyone used just one model, everyone would get the same answer → **crowded trades** with poor risk-reward.

Using all three enables **consensus checking**:

| Scenario | Gemini (Macro) | Grok (Sentiment) | ChatGPT (Backtest) | Decision |
|----------|---|---|---|---|
| Bullish macro + Bullish sentiment + 78% win rate | ✅ | ✅ | ✅ | **STRONG BUY** |
| Bullish macro + Bearish sentiment + 45% win rate | ✅ | ❌ | ❌ | **HOLD** |
| Neutral macro + Extreme fear + 62% win rate | ⚠️ | ✅ | ✅ | **BUY** (contrarian) |
| Bearish macro + Bullish retail hype + 35% win rate | ❌ | ✅ | ❌ | **SELL** (avoid trap) |

### Consensus Metrics

- **Model Agreement**: 0-100% (how aligned are all three models)
- **Risk Score**: 0-100 (combined risk from all analysis)
- **Final Recommendation**: Strong Buy → Buy → Hold → Sell → Strong Sell

**High Agreement + Low Risk = Highest Conviction Trades**

---

## Trading Modes

### Mode 1: **Manual**
User controls everything. No AI analysis. Perfect for experienced traders.

### Mode 2: **NEX AI** 
- Runs tri-model analysis when user clicks "Analyze"
- Shows all three specialist insights
- User reviews and decides whether to trade
- **Use Case**: When you want AI insights but keep decision control

### Mode 3: **NEX TFC** (Take Full Control)
- Automatically runs tri-model analysis
- Auto-executes when consensus is strong (80%+ agreement)
- User only sets: amount, analysis timeframe, entry timeframe
- **Use Case**: Hands-off automated trading with strong signal confirmation

---

## Analysis Parameters

Users can customize:

- **Analysis Timeframe**: 5, 15, 30, 60 minutes of historical data
- **Entry Timeframe**: 5, 10, 15 minutes from analysis completion
- **Amount**: Fixed dollar amount or percentage of account
- **Exchange**: Which connected exchange to trade on

---

## Example Trade Flow

1. **User selects BTC, sets $500 trade**
2. **Clicks "NEX AI" or "NEX TFC"**
3. **System runs parallel AI analysis**:
   - Gemini scans macro data → "Institutional accumulation bullish"
   - Grok checks Twitter → "86% bullish sentiment, high urgency"
   - ChatGPT backtests → "78% win rate on similar patterns"
4. **Consensus reached**: 87% agreement, Strong Buy signal
5. **If NEX AI**: Shows all insights, user approves trade
6. **If NEX TFC**: Auto-executes with $500 on selected exchange
7. **Trade executed**: Entry at breakout, scaled exits at +3/+5/+8%

---

## Important Notes

- **NOT Price Prediction**: This system does NOT predict prices
- **Co-Pilot, Not Autopilot**: Final signals come from proprietary risk management logic
- **Risk Management**: Stop losses and position sizing are controlled by the trader
- **Real-time Integration**: Requires active API connections to Gemini, Grok, ChatGPT, and exchange APIs

---

## Risk Disclosure

The tri-model system provides **research acceleration**, not guaranteed profits. Past backtest performance does not guarantee future results. Always use appropriate position sizing and stop losses.
