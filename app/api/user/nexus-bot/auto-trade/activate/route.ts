import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { isNexusAutoTradePlanKey, planByKey } from "@/lib/nexus-bot/plans"
import {
  activateNexusBotSession,
  completeDueNexusBotSessions,
} from "@/lib/server/nexus-bot-session-service"
import { readNexusMainAvailableUsd } from "@/lib/server/nexus-main-enforcement"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as {
      planKey?: string
      stakeUsd?: number
      confirm?: boolean
    }
    const planKey = typeof body.planKey === "string" ? body.planKey.trim() : ""
    if (!isNexusAutoTradePlanKey(planKey)) {
      return NextResponse.json({ error: "Invalid auto-trade plan." }, { status: 400 })
    }
    if (body.confirm !== true) {
      return NextResponse.json(
        { error: "Confirm activation before starting Auto Trade." },
        { status: 400 },
      )
    }

    const plan = planByKey(planKey)!
    const stakeUsd = Number(body.stakeUsd ?? 0)
    if (!(stakeUsd > 0)) {
      return NextResponse.json({ error: "Enter a valid stake amount." }, { status: 400 })
    }

    const admin = createAdminClient()
    await completeDueNexusBotSessions(admin, user.id)

    const available = await readNexusMainAvailableUsd(admin, user.id)
    if (stakeUsd > available) {
      return NextResponse.json({ error: "Insufficient Nexus Main balance." }, { status: 400 })
    }

    const out = await activateNexusBotSession(admin, {
      userId: user.id,
      sessionKind: "auto",
      stakeUsd,
      planKey,
      strategyTitle: `${plan.label} — Nexus Auto`,
      confidence: "Operations",
      durationHours: plan.hours,
    })

    return NextResponse.json({
      ok: true,
      sessionId: out.sessionId,
      endsAt: out.endsAt,
      planKey,
      stakeUsd,
      availableUsd: out.available_balance,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const status =
      msg === "AUTO_TRADE_NOT_GRANTED" ||
      msg === "INSUFFICIENT_BALANCE" ||
      msg === "BOT_SESSION_ALREADY_ACTIVE"
        ? 400
        : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
