import { NextRequest, NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import type { LearnedPattern } from "@/lib/strategy-learner"

type DbRow = {
  pattern_key: string
  action: string
  signal: string
  win_rate: number
  total_trades: number
  wins: number
  losses: number
  blocked: boolean
  updated_at: string
}

function rowToPattern(row: DbRow): LearnedPattern {
  return {
    pattern: row.pattern_key,
    action: row.action,
    signal: row.signal,
    totalTrades: row.total_trades,
    wins: row.wins,
    losses: row.losses,
    winRate: row.win_rate,
    avgPnl: 0,
    blocked: row.blocked,
    lastObserved: new Date(row.updated_at).getTime(),
  }
}

export async function GET() {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const supabase = await createRouteHandlerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ patterns: [] })
  }

  const { data, error } = await supabase
    .from("blocked_trade_patterns")
    .select("pattern_key,action,signal,win_rate,total_trades,wins,losses,blocked,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })

  if (error) {
    console.warn("[learner-patterns] GET:", error.message)
    return NextResponse.json({ patterns: [] })
  }

  const rows = (data ?? []) as DbRow[]
  return NextResponse.json({ patterns: rows.map(rowToPattern) })
}

export async function POST(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const supabase = await createRouteHandlerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { pattern?: LearnedPattern }
  try {
    body = (await request.json()) as { pattern?: LearnedPattern }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const p = body.pattern
  if (!p?.pattern || !p.action || !p.signal) {
    return NextResponse.json({ error: "pattern, action, signal required" }, { status: 400 })
  }

  const row = {
    user_id: user.id,
    pattern_key: p.pattern,
    action: String(p.action).toLowerCase(),
    signal: String(p.signal).toLowerCase(),
    win_rate: p.winRate,
    total_trades: p.totalTrades,
    wins: p.wins,
    losses: p.losses,
    blocked: p.blocked !== false,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from("blocked_trade_patterns").upsert(row, {
    onConflict: "user_id,pattern_key",
  })

  if (error) {
    console.error("[learner-patterns] POST:", error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
