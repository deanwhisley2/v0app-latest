/**
 * CLINE INSTRUCTION: This API route connects the UI to the Strategy Commander.
 *
 * FLOW:
 * UI Command → API Route → commanderDecide() → validate → risk check → queue
 *
 * DO NOT:
 * Call exchange APIs directly from here (use executeOrder separately)
 * Bypass commanderDecide() for any trade signal
 * Mark a trade as "filled" without broker confirmation
 */

import { NextRequest, NextResponse } from 'next/server'
import { commanderDecide, executeOrder, getOrderHistory, getSignalsHistory } from '@/lib/strategy-commander'
import { BOT_REGISTRY, getBotStatus, updateBotStatus } from '@/lib/bot-registry'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const botId = searchParams.get('botId')
  const type = searchParams.get('type') // 'orders' or 'signals'

  // Get order history
  if (type === 'orders') {
    const orders = getOrderHistory(botId || undefined)
    return NextResponse.json({ orders })
  }

  // Get signal history
  if (type === 'signals') {
    const signals = getSignalsHistory()
    return NextResponse.json({ signals })
  }

  // Get bot statuses
  if (!botId) {
    const allBots = BOT_REGISTRY.map(bot => ({
      ...bot,
      status: getBotStatus(bot.id)
    }))
    return NextResponse.json({ bots: allBots })
  }

  const status = getBotStatus(botId)
  return NextResponse.json({ botId, status })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { command, botId, action, signal, executionMode, orderId } = body

  // Handle natural language command
  if (command) {
    const parsed = parseCommand(command)
    if (!parsed) {
      return NextResponse.json({
        success: false,
        message: "Command not recognized. Examples:\n" +
          "- 'start Liquidity Warfare on BTC with 1.5% risk'\n" +
          "- 'pause Sentiment Weapon'\n" +
          "- 'show status of all bots'\n" +
          "- 'why was Liquidity Warfare blocked'"
      }, { status: 400 })
    }

    const result = await executeCommand(parsed)
    return NextResponse.json(result)
  }

  // Handle trade signal submission (STRATEGIES CALL THIS)
  if (signal) {
    const order = await commanderDecide(signal, executionMode || "paper")
    return NextResponse.json({
      success: order.status !== "REJECTED",
      order,
      message: order.status === "REJECTED" ? order.rejectionReason : "Signal accepted, order pending"
    })
  }

  // Handle order execution (after Commander approval)
  if (orderId && action === 'execute') {
    try {
      // Pass your actual broker API here
      const brokerApi = {} // Replace with your Binance/Bitget API client
      const executedOrder = await executeOrder(orderId, brokerApi)
      return NextResponse.json({
        success: executedOrder.status === "FILLED",
        order: executedOrder,
        message: executedOrder.status === "FILLED" ? "Order executed successfully" : `Execution failed: ${executedOrder.rejectionReason}`
      })
    } catch (error) {
      console.error("Error executing order:", error)
      return NextResponse.json({
        success: false,
        message: error instanceof Error ? error.message : "Execution failed"
      }, { status: 500 })
    }
  }

  // Handle direct bot control (start/pause/stop from UI)
  if (botId) {
    const { action: botAction, symbol, riskPercent, mode } = body

    switch (botAction) {
      case 'start':
        // When starting a bot, we're telling it to START SENDING SIGNALS to Commander
        const startResult = await startBot(botId, { symbol, riskPercent, mode })
        return NextResponse.json(startResult)

      case 'pause':
        const pauseResult = await pauseBot(botId)
        return NextResponse.json(pauseResult)

      case 'stop':
        const stopResult = await stopBot(botId)
        return NextResponse.json(stopResult)

      default:
        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
    }
  }

  return NextResponse.json({ error: 'Missing command, signal, or botId' }, { status: 400 })
}

// ============================================================
// Natural Language Command Parser
// ============================================================

function parseCommand(input: string): any {
  const lower = input.toLowerCase()

  // Pattern: start [bot name] on [symbol] with [risk]% risk
  const startMatch = input.match(/start\s+(\w+(?:\s+\w+)?)\s+on\s+(\w+)\s+with\s+([\d.]+)%?\s*risk/i)
  if (startMatch) {
    return {
      action: 'start',
      botName: startMatch[1],
      symbol: startMatch[2].toUpperCase(),
      riskPercent: parseFloat(startMatch[3])
    }
  }

  // Pattern: pause [bot name]
  const pauseMatch = input.match(/pause\s+(\w+(?:\s+\w+)?)/i)
  if (pauseMatch) {
    return { action: 'pause', botName: pauseMatch[1] }
  }

  // Pattern: stop [bot name]
  const stopMatch = input.match(/stop\s+(\w+(?:\s+\w+)?)/i)
  if (stopMatch) {
    return { action: 'stop', botName: stopMatch[1] }
  }

  // Pattern: show status of [bot name] or just "status"
  if (lower.includes('status')) {
    const statusMatch = input.match(/status\s+(?:of\s+)?(\w+(?:\s+\w+)?)/i)
    if (statusMatch) {
      return { action: 'status', botName: statusMatch[1] }
    }
    return { action: 'status', botName: 'all' }
  }

  // Pattern: why was [bot name] blocked
  const whyMatch = input.match(/why\s+was\s+(\w+(?:\s+\w+)?)\s+blocked/i)
  if (whyMatch) {
    return { action: 'explain_block', botName: whyMatch[1] }
  }

  // Pattern: show orders or history
  if (lower.includes('orders') || lower.includes('history')) {
    return { action: 'history', botName: 'all' }
  }

  return null
}

async function executeCommand(parsed: any): Promise<any> {
  const bot = BOT_REGISTRY.find(b =>
    b.name.toLowerCase().includes(parsed.botName?.toLowerCase() || '') ||
    b.id.toLowerCase().includes(parsed.botName?.toLowerCase() || '')
  )

  if (!bot && parsed.action !== 'status' && parsed.action !== 'history') {
    return {
      success: false,
      message: `Bot "${parsed.botName}" not found. Available: ${BOT_REGISTRY.map(b => b.name).join(', ')}`
    }
  }

  switch (parsed.action) {
    case 'start':
      return await startBot(bot!.id, {
        symbol: parsed.symbol || bot!.defaultSymbol,
        riskPercent: parsed.riskPercent || bot!.defaultRiskPercent,
        mode: 'paper'
      })

    case 'pause':
      return await pauseBot(bot!.id)

    case 'stop':
      return await stopBot(bot!.id)

    case 'status':
      if (parsed.botName === 'all' || !bot) {
        const allStatuses = BOT_REGISTRY.map(b => {
          const status = getBotStatus(b.id)
          return `${b.name}: ${status.status} | PnL: $${status.todayPnL.toFixed(2)} | WR: ${status.winRate.toFixed(0)}%`
        }).join('\n')
        return { success: true, message: `All Bots Status:\n${allStatuses}` }
      }
      const status = getBotStatus(bot.id)
      return {
        success: true,
        message: `${bot.name}: ${status.status} | PnL: $${status.todayPnL.toFixed(2)} | WR: ${status.winRate.toFixed(0)}% | Confidence: ${status.confidence.toFixed(0)}%`
      }

    case 'explain_block':
      const orders = getOrderHistory(bot!.id)
      const lastRejected = orders.find(o => o.status === "REJECTED")
      if (lastRejected) {
        return {
          success: true,
          message: `[SAFETY] ${bot!.name} was blocked at ${new Date(lastRejected.createdAt).toLocaleTimeString()}. Reason: ${lastRejected.rejectionReason}\nAudit: ${lastRejected.auditTrail.map(a => `${a.step}: ${a.message}`).join(' → ')}`
        }
      }
      return { success: true, message: `${bot!.name} has no blocked trades in history.` }

    case 'history':
      const allOrders = getOrderHistory()
      const recent = allOrders.slice(0, 5)
      if (recent.length === 0) return { success: true, message: "No orders in history." }
      return {
        success: true,
        message: `Last ${recent.length} orders:\n${recent.map(o => `${o.createdAt.slice(11, 16)} | ${o.strategyId} | ${o.action} | ${o.status}`).join('\n')}`
      }

    default:
      return { success: false, message: `Unknown action: ${parsed.action}` }
  }
}

async function startBot(botId: string, options?: { symbol?: string; riskPercent?: number; mode?: string }) {
  const bot = BOT_REGISTRY.find(b => b.id === botId)
  if (!bot) return { success: false, message: 'Bot not found' }

  // In production: Enable the bot to start sending signals to Commander
  // This would set a flag in your bot's configuration
  const updatedStatus = updateBotStatus(botId, {
    status: 'RUNNING',
    lastSignalAt: new Date().toISOString()
  })

  return {
    success: true,
    message: `${bot.name} started. It will now send signals to the Strategy Commander for validation. Mode: ${options?.mode || 'paper'}`,
    botId,
    status: updatedStatus
  }
}

async function pauseBot(botId: string) {
  const bot = BOT_REGISTRY.find(b => b.id === botId)
  const updatedStatus = updateBotStatus(botId, {
    status: 'PAUSED'
  })
  return {
    success: true,
    message: `${bot?.name || botId} paused. No new signals will be sent to Commander.`,
    status: updatedStatus
  }
}

async function stopBot(botId: string) {
  const bot = BOT_REGISTRY.find(b => b.id === botId)
  const updatedStatus = updateBotStatus(botId, {
    status: 'STOPPED'
  })
  return {
    success: true,
    message: `${bot?.name || botId} stopped. All open orders have been cancelled.`,
    status: updatedStatus
  }
}
