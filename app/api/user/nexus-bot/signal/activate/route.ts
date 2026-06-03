import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { NEXUS_SIGNAL_STAKE_TIERS_USD } from "@/lib/nexus-bot/plans"
import {
  activateNexusBotSession,
  completeDueNexusBotSessions,
  findOpenSignalCode,
} from "@/lib/server/nexus-bot-session-service"
import { readNexusMainAvailableUsd } from "@/lib/server/nexus-main-enforcement"
import type { NexusSignalSlot } from "@/lib/nexus-bot/plans"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as {
      slot?: NexusSignalSlot
      code?: string
      stakeTierUsd?: number | "max"
    }
    const slot = body.slot === "evening" ? "evening" : body.slot === "morning" ? "morning" : null
    const code = typeof body.code === "string" ? body.code : ""
    if (!slot || !code.trim()) {
      return NextResponse.json({ error: "slot and code are required." }, { status: 400 })
    }

    const admin = createAdminClient()
    await completeDueNexusBotSessions(admin, user.id)

    const signal = await findOpenSignalCode(admin, slot, code)
    if (!signal) {
      return NextResponse.json(
        { error: "This code is not active for the current session window." },
        { status: 400 },
      )
    }

    const available = await readNexusMainAvailableUsd(admin, user.id)
    let stakeUsd: number
    if (body.stakeTierUsd === "max") {
      stakeUsd = available
    } else {
      const tier = Number(body.stakeTierUsd)
      if (!NEXUS_SIGNAL_STAKE_TIERS_USD.includes(tier as (typeof NEXUS_SIGNAL_STAKE_TIERS_USD)[number])) {
        return NextResponse.json({ error: "Invalid stake tier." }, { status: 400 })
      }
      stakeUsd = tier
    }
    if (!(stakeUsd > 0) || stakeUsd > available) {
      return NextResponse.json({ error: "Insufficient Nexus Main balance." }, { status: 400 })
    }

    const out = await activateNexusBotSession(admin, {
      userId: user.id,
      sessionKind: "signal",
      stakeUsd,
      signalCodeId: signal.id,
      strategyTitle: signal.strategy_title,
      confidence: signal.confidence,
      durationHours: signal.duration_hours,
    })

    return NextResponse.json({
      ok: true,
      sessionId: out.sessionId,
      endsAt: out.endsAt,
      stakeUsd,
      availableUsd: out.available_balance,
      strategyTitle: signal.strategy_title,
      confidence: signal.confidence,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const status =
      msg === "INSUFFICIENT_BALANCE" || msg === "BOT_SESSION_ALREADY_ACTIVE" ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
