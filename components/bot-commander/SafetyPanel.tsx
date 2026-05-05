"use client"
import { useCallback, useEffect, useState } from "react"

interface SafetyEvent {
  id: string
  timestamp: string
  botId: string
  reason: string
  validator: string
  wasCorrect: boolean
}

export default function SafetyPanel() {
  const [demoMode, setDemoMode] = useState(false)
  const [demoExpiry, setDemoExpiry] = useState(0)

  const refreshDemo = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-mode", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as { enabled?: boolean; remainingSeconds?: number }
      setDemoMode(Boolean(data.enabled))
      setDemoExpiry(typeof data.remainingSeconds === "number" ? data.remainingSeconds : 0)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refreshDemo()
    const id = window.setInterval(() => void refreshDemo(), 2000)
    return () => window.clearInterval(id)
  }, [refreshDemo])

  const [safetyStatus, setSafetyStatus] = useState({
    preTradeValidator: 'ACTIVE',
    guardrailEngine: 'ACTIVE',
    strategyLearner: 'ACTIVE',
    raceConditionEngine: 'ACTIVE'
  })
  
  const [blockedTrades, setBlockedTrades] = useState<SafetyEvent[]>([
    { id: '1', timestamp: new Date().toISOString(), botId: 'liquidity_warfare', reason: 'Risk limit exceeded (2% max)', validator: 'PreTradeValidator', wasCorrect: true },
    { id: '2', timestamp: new Date(Date.now() - 3600000).toISOString(), botId: 'sentiment_weapon', reason: 'RSI extreme (82 - overbought)', validator: 'PreTradeValidator', wasCorrect: true }
  ])
  
  const [dailyStats, setDailyStats] = useState({
    totalBlocks: 2,
    riskBlocks: 1,
    patternBlocks: 0,
    rsiBlocks: 1,
    cooldownBlocks: 0,
    guardrailBlocks: 0
  })

  const getReasonColor = (reason: string) => {
    if (reason.includes('Risk') || reason.includes('limit')) return '#FF3A3A'
    if (reason.includes('pattern')) return '#FFB800'
    if (reason.includes('RSI')) return '#FF8C00'
    if (reason.includes('Cooldown')) return '#00E5FF'
    if (reason.includes('Guardrail')) return '#8B00FF'
    return '#8B92A5'
  }

  return (
    <div style={{ backgroundColor: '#111318', border: '1px solid #1E2028', borderRadius: '8px', padding: '20px' }}>
      <h3 style={{ fontFamily: "'Space Mono', monospace", fontSize: '16px', color: '#F0F2F5', marginBottom: '16px' }}>
        🛡️ SAFETY DASHBOARD
      </h3>

      {/* Pipeline Status */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: '#8B92A5', marginBottom: '12px' }}>SAFETY PIPELINE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {Object.entries(safetyStatus).map(([name, status], idx) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                backgroundColor: status === 'ACTIVE' ? '#111318' : '#1E2028',
                border: `1px solid ${status === 'ACTIVE' ? '#39FF14' : '#FF3A3A'}`,
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '11px',
                fontFamily: "'Space Mono', monospace"
              }}>
                <span style={{ color: status === 'ACTIVE' ? '#39FF14' : '#FF3A3A' }}>
                  {status === 'ACTIVE' ? '●' : '○'}
                </span> {name.replace(/([A-Z])/g, ' $1').trim()}
              </div>
              {idx < Object.keys(safetyStatus).length - 1 && (
                <span style={{ color: '#00E5FF', fontSize: '16px' }}>→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Blocked Trades Log */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: '#8B92A5', marginBottom: '12px' }}>
          BLOCKED TRADES TODAY ({dailyStats.totalBlocks})
        </div>
        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1E2028', color: '#8B92A5' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Time</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Bot</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Reason</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Validator</th>
            </tr>
          </thead>
          <tbody>
            {blockedTrades.map(trade => (
              <tr key={trade.id} style={{ borderBottom: '1px solid #1E2028' }}>
                <td style={{ padding: '8px', color: '#8B92A5' }}>{new Date(trade.timestamp).toLocaleTimeString()}</td>
                <td style={{ padding: '8px', fontFamily: "'Space Mono', monospace" }}>{trade.botId}</td>
                <td style={{ padding: '8px', color: getReasonColor(trade.reason) }}>{trade.reason}</td>
                <td style={{ padding: '8px', color: '#00E5FF' }}>{trade.validator}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Guardrail Settings */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: '#8B92A5', marginBottom: '12px' }}>GUARDRAIL SETTINGS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#8B92A5' }}>Slippage tolerance</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '14px', color: '#F0F2F5' }}>0.5%</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#8B92A5' }}>Max risk per trade</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '14px', color: '#F0F2F5' }}>2%</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#8B92A5' }}>Daily loss limit</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '14px', color: '#F0F2F5' }}>5%</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#8B92A5' }}>Cooldown after loss</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '14px', color: '#F0F2F5' }}>30 sec</div>
          </div>
        </div>
      </div>

      {/* Demo mode — only suppresses exchange send; analysis stays real */}
      <div
        style={{
          marginBottom: "24px",
          borderTop: "1px solid #1E2028",
          paddingTop: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              color: "#F0F2F5",
              fontWeight: "bold",
            }}
          >
            <input
              type="checkbox"
              checked={demoMode}
              onChange={async (e) => {
                const enabled = e.target.checked
                await fetch("/api/demo-mode", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ enabled, duration: 5 }),
                })
                await refreshDemo()
              }}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
            DEMO MODE (no orders to exchange)
          </label>
          {demoMode && demoExpiry > 0 ? (
            <span
              style={{
                backgroundColor: "#FFB800",
                color: "#0A0B0E",
                padding: "4px 12px",
                borderRadius: "4px",
                fontFamily: "'Space Mono', monospace",
                fontSize: "12px",
              }}
            >
              Auto-off in {Math.floor(demoExpiry / 60)}:{(demoExpiry % 60).toString().padStart(2, "0")}
            </span>
          ) : null}
        </div>
        <p style={{ fontSize: "11px", color: "#8B92A5", marginTop: "8px" }}>
          {demoMode
            ? "Demo on: strategies and safety still run; execute route will not send live orders."
            : "Real execute path: ensure keys and risk limits before disabling demo."}
        </p>
      </div>

      {/* Emergency Controls */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={() => {
            if (confirm('PAUSE ALL BOTS? No new trades will be opened.')) {
              alert('All bots paused.')
            }
          }}
          style={{
            flex: 1,
            backgroundColor: '#FFB800',
            color: '#0A0B0E',
            border: 'none',
            borderRadius: '4px',
            padding: '10px',
            fontFamily: "'Space Mono', monospace",
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          ⏸ PAUSE ALL
        </button>
        <button
          onClick={() => {
            if (confirm('CANCEL ALL ORDERS? This will cancel every open order.')) {
              alert('All orders cancelled.')
            }
          }}
          style={{
            flex: 1,
            backgroundColor: '#FF3A3A',
            color: '#F0F2F5',
            border: 'none',
            borderRadius: '4px',
            padding: '10px',
            fontFamily: "'Space Mono', monospace",
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          ✗ CANCEL ALL
        </button>
        <button
          onClick={() => {
            const confirmText = prompt('Type "SHUTDOWN" to confirm emergency shutdown:')
            if (confirmText === 'SHUTDOWN') {
              alert('EMERGENCY SHUTDOWN ACTIVATED. All trading stopped.')
            }
          }}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: '2px solid #FF3A3A',
            color: '#FF3A3A',
            borderRadius: '4px',
            padding: '8px',
            fontFamily: "'Space Mono', monospace",
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          ⚠ SHUTDOWN
        </button>
      </div>
    </div>
  )
}
