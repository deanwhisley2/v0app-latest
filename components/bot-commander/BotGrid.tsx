'use client'
import { useState } from 'react'
import { BotCapability, BotStatusUI } from '@/lib/bot-capability-types'

interface BotGridProps {
  bots: BotCapability[]
  statuses: Record<string, BotStatusUI>
  onStart: (botId: string, symbol: string, risk: number) => void
  onPause: (botId: string) => void
  onStop: (botId: string) => void
  onConfigure: (botId: string, config: any) => void
}

export default function BotGrid({ bots, statuses, onStart, onPause, onStop, onConfigure }: BotGridProps) {
  const [selectedBot, setSelectedBot] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return '#39FF14' // neon green
      case 'PAUSED': return '#FFB800'  // amber
      case 'STOPPED': return '#8B92A5' // gray
      case 'BLOCKED_BY_SAFETY': return '#FF3A3A' // red
      default: return '#8B92A5'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RUNNING': return '●'
      case 'PAUSED': return '⏸'
      case 'STOPPED': return '■'
      case 'BLOCKED_BY_SAFETY': return '⚠'
      default: return '○'
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '16px' }}>
      {bots.map(bot => {
        const status = statuses[bot.id] || { status: 'STOPPED', todayPnL: 0, winRate: 0, confidence: 0, isPaperTrading: true } as BotStatusUI
        
        return (
          <div
            key={bot.id}
            style={{
              backgroundColor: '#111318',
              border: `1px solid ${status.status === 'RUNNING' ? '#00E5FF' : '#1E2028'}`,
              borderRadius: '8px',
              padding: '20px',
              transition: 'all 0.2s'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontFamily: "'Space Mono', monospace", fontSize: '18px', color: '#F0F2F5', margin: 0 }}>
                  {bot.name}
                </h3>
                <span style={{ 
                  fontSize: '11px',
                  color: getStatusColor(status.status),
                  fontFamily: "'Space Mono', monospace",
                  display: 'inline-block',
                  marginTop: '4px'
                }}>
                  {getStatusIcon(status.status)} {status.status}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: status.todayPnL >= 0 ? '#39FF14' : '#FF3A3A' }}>
                  ${status.todayPnL?.toFixed(2) || '0.00'}
                </div>
                <div style={{ fontSize: '10px', color: '#8B92A5' }}>Today PnL</div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#0A0B0E', padding: '8px', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', color: '#8B92A5' }}>Win Rate</div>
                <div style={{ fontSize: '18px', fontFamily: "'Space Mono', monospace", color: '#F0F2F5' }}>
                  {status.winRate?.toFixed(1) || '0'}%
                </div>
              </div>
              <div style={{ backgroundColor: '#0A0B0E', padding: '8px', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', color: '#8B92A5' }}>Confidence</div>
                <div style={{ fontSize: '18px', fontFamily: "'Space Mono', monospace", color: '#00E5FF' }}>
                  {status.confidence?.toFixed(0) || '0'}%
                </div>
              </div>
            </div>

            {/* Current Position */}
            <div style={{ fontSize: '12px', color: '#8B92A5', marginBottom: '16px', borderTop: '1px solid #1E2028', paddingTop: '12px' }}>
              <div>📊 {status.currentSymbol || 'BTCUSDT'} | Risk: {status.currentRisk || 1.5}%</div>
              <div style={{ marginTop: '4px' }}>🕐 Last: {status.lastAction || 'Waiting for signal'}</div>
              <div style={{ marginTop: '4px' }}>
                🧪 Mode: <span style={{ color: status.isPaperTrading ? '#FFB800' : '#39FF14' }}>
                  {status.isPaperTrading ? 'PAPER' : 'LIVE'}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {status.status !== 'RUNNING' && (
                <button
                  onClick={() => {
                    const symbol = prompt('Enter symbol (e.g., BTCUSDT):', bot.defaultSymbol)
                    const risk = prompt('Risk % (0.5-5):', bot.defaultRiskPercent.toString())
                    if (symbol && risk) onStart(bot.id, symbol.toUpperCase(), parseFloat(risk))
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#00E5FF',
                    color: '#0A0B0E',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px',
                    fontFamily: "'Space Mono', monospace",
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ▶ START
                </button>
              )}
              {status.status === 'RUNNING' && (
                <button
                  onClick={() => onPause(bot.id)}
                  style={{
                    flex: 1,
                    backgroundColor: '#FFB800',
                    color: '#0A0B0E',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px',
                    fontFamily: "'Space Mono', monospace",
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ⏸ PAUSE
                </button>
              )}
              {status.status !== 'STOPPED' && (
                <button
                  onClick={() => {
                    if (confirm(`Stop ${bot.name}? This will cancel all open orders.`)) {
                      onStop(bot.id)
                    }
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#FF3A3A',
                    color: '#F0F2F5',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px',
                    fontFamily: "'Space Mono', monospace",
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ■ STOP
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedBot(bot.id)
                  setShowConfig(true)
                }}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#1E2028',
                  color: '#F0F2F5',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ⚙
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
