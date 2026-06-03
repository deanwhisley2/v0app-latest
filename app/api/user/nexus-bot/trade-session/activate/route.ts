import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { NEXUS_SIGNAL_STAKE_TIERS_USD } from "@/lib/nexus-bot/plans"
import {
  activateTradeSessionBot,
  completeDueNexusBotSessions,
} from "@/lib/server/nexus-bot-session-service"
import { readNexusMainAvailableUsd } from "@/lib/server/nexus-main-enforcement"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as {
      code?: string
      stakeTierUsd?: number | "max"
      confirm?: boolean
    }
    const code = typeof body.code === "string" ? body.code : ""
    if (!code.trim()) {
      return NextResponse.json({ error: "Enter a trade code." }, { status: 400 })
    }
    if (!body.confirm) {
      return NextResponse.json({ error: "CONFIRMATION_REQUIRED" }, { status: 400 })
    }

    const admin = createAdminClient()
    await completeDueNexusBotSessions(admin, user.id)

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

    const out = await activateTradeSessionBot(admin, {
      userId: user.id,
      code,
      stakeUsd,
      confirmed: true,
    })

    return NextResponse.json({
      ok: true,
      sessionId: out.sessionId,
      startAt: out.startAt,
      endsAt: out.endsAt,
      displayPhase: out.displayPhase,
      stakeUsd,
      availableUsd: out.available_balance,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const status =
      msg === "INSUFFICIENT_BALANCE" ||
      msg === "BOT_SESSION_ALREADY_ACTIVE" ||
      msg === "SESSION_ALREADY_JOINED" ||
      msg === "CODE_INVALID_OR_EXPIRED" ||
      msg === "SESSION_EXPIRED" ||
      msg === "CONFIRMATION_REQUIRED"
        ? 400
        : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
