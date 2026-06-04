import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { NEXUS_SIGNAL_STAKE_TIERS_USD } from "@/lib/nexus-bot/plans"
import { userSessionPresentation } from "@/lib/nexus-bot/user-session-messaging"
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
      verificationId?: string
      stakeTierUsd?: number | "max"
      confirm?: boolean
    }
    const code = typeof body.code === "string" ? body.code : ""
    const verificationId = typeof body.verificationId === "string" ? body.verificationId : ""
    if (!code.trim()) {
      return NextResponse.json({ error: "Enter a trade code." }, { status: 400 })
    }
    if (!verificationId.trim()) {
      return NextResponse.json({ error: "Verify the trade code before activating." }, { status: 400 })
    }
    if (!body.confirm) {
      return NextResponse.json({ error: "Confirm activation to continue." }, { status: 400 })
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
        return NextResponse.json({ error: "Invalid capital tier." }, { status: 400 })
      }
      stakeUsd = tier
    }
    if (!(stakeUsd > 0) || stakeUsd > available) {
      return NextResponse.json({ error: "Insufficient Nexus Main balance." }, { status: 400 })
    }

    const out = await activateTradeSessionBot(admin, {
      userId: user.id,
      verificationId,
      code,
      stakeUsd,
      confirmed: true,
    })

    const presentation = userSessionPresentation(out.phaseKey)
    const booked = out.status === "booked"

    return NextResponse.json({
      ok: true,
      sessionId: out.sessionId,
      phaseKey: out.phaseKey,
      headline: booked ? "Trade booked successfully" : presentation.headline,
      detail: booked ? "Waiting for session start" : presentation.detail,
      status: out.status,
      stakeUsd,
      participationWeight: out.participationWeight,
      availableUsd: out.available_balance,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const friendly: Record<string, string> = {
      INSUFFICIENT_BALANCE: "Insufficient Nexus Main balance.",
      BOT_SESSION_ALREADY_ACTIVE: "You already have an active trade session.",
      SESSION_ALREADY_JOINED: "You have already joined this session.",
      CODE_INVALID_OR_EXPIRED: "This trade code is not active or has expired.",
      SESSION_EXPIRED: "This session window has ended.",
      SESSION_NO_EARNINGS_REMAINING:
        "This session has no remaining earnings allocation. Join an active session earlier.",
      CONFIRMATION_REQUIRED: "Confirm activation to continue.",
      VERIFICATION_INVALID: "Verify the trade code again before activating.",
      VERIFICATION_EXPIRED: "Verification expired — verify the code again.",
      VERIFICATION_CODE_MISMATCH: "Code does not match your verification.",
    }
    const status =
      msg in friendly ||
      msg === "INSUFFICIENT_BALANCE" ||
      msg === "BOT_SESSION_ALREADY_ACTIVE" ||
      msg === "SESSION_ALREADY_JOINED"
        ? 400
        : 500
    return NextResponse.json({ error: friendly[msg] ?? msg }, { status })
  }
}
