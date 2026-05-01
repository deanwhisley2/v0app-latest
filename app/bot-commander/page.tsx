'use client'
import { useState, useEffect } from 'react'
import BotGrid from '@/components/bot-commander/BotGrid'
import CommandCenter from '@/components/bot-commander/CommandCenter'
import SafetyPanel from '@/components/bot-commander/SafetyPanel'
import { BOT_REGISTRY } from '@/lib/bot-registry'
import { BotStatusUI } from '@/lib/bot-capability-types'

export default function BotCommanderPage() {
  const [bots] = useState(BOT_REGISTRY)
  const [statuses, setStatuses] = useState<Record<string, BotStatusUI>>({})
  const [loading, setLoading] = useState(true)
  const refreshStatuses = async () => {
    const res = await fetch('/api/bot-commander')
    const data = await res.json()
    if (data.bots) {
      const statusMap: Record<string, BotStatusUI> = {}
      data.bots.forEach((bot: any) => {
        statusMap[bot.id] = bot.status
      })
      setStatuses(statusMap)
    }
  }

  // Fetch bot statuses periodically
  useEffect(() => {
    const fetchStatuses = async () => {
      try {
        await refreshStatuses()
      } catch (error) {
        console.error('Failed to fetch bot statuses:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStatuses()
    const interval = setInterval(fetchStatuses, 5000) // update every 5 seconds
    return () => clearInterval(interval)
  }, [])

  const handleCommand = async (command: string) => {
    const res = await fetch('/api/bot-commander', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    })
    const data = await res.json()
    await refreshStatuses()
    return data
  }

  const handleStart = async (botId: string, symbol: string, riskPercent: number) => {
    const res = await fetch('/api/bot-commander', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, action: 'start', symbol, riskPercent })
    })
    const data = await res.json()
    if (data.success) {
      await refreshStatuses()
    } else {
      alert(`Failed to start bot: ${data.message}`)
    }
  }

  const handlePause = async (botId: string) => {
    const res = await fetch('/api/bot-commander', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, action: 'pause' })
    })
    const data = await res.json()
    if (!data.success) {
      alert(`Failed to pause bot: ${data.message || 'Unknown error'}`)
      return
    }
    await refreshStatuses()
  }

  const handleStop = async (botId: string) => {
    const res = await fetch('/api/bot-commander', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, action: 'stop' })
    })
    const data = await res.json()
    if (!data.success) {
      alert(`Failed to stop bot: ${data.message || 'Unknown error'}`)
      return
    }
    await refreshStatuses()
  }

  const handleConfigure = async (botId: string, config: any) => {
    await fetch('/api/bot-commander', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, action: 'configure', config })
    })
  }

  if (loading) {
    return (
      <div style={{ backgroundColor: '#0A0B0E', minHeight: '100vh', padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: '#00E5FF', fontFamily: "'Space Mono', monospace" }}>Loading NEXUS PRO Commander...</div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: '#0A0B0E', minHeight: '100vh', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: '28px', color: '#00E5FF', marginBottom: '8px' }}>
          NEXUS PRO — BOT COMMANDER
        </h1>
        <p style={{ color: '#8B92A5', fontSize: '14px' }}>One dashboard to rule all bots. Start, pause, configure, and monitor.</p>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>
        {/* Left Column: Bot Grid */}
        <div>
          <BotGrid
            bots={bots}
            statuses={statuses}
            onStart={handleStart}
            onPause={handlePause}
            onStop={handleStop}
            onConfigure={handleConfigure}
          />
        </div>

        {/* Right Column: Terminal + Safety */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <CommandCenter onCommand={handleCommand} />
          <SafetyPanel />
        </div>
      </div>
    </div>
  )
}
