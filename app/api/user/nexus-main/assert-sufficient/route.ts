import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { readNexusMainAvailableUsd } from "@/lib/server/nexus-main-enforcement"

/**
 * Server-side eligibility check: requested USD must fit in Nexus Main (`available_balance`) only.
 * Does not reserve funds — use fixed-trade / copy-trade / expert routes for atomic debits.
 */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as { requiredUsd?: number }
    const requiredUsd = Number(body.requiredUsd ?? 0)
    if (!Number.isFinite(requiredUsd) || requiredUsd <= 0) {
      return NextResponse.json({ error: "requiredUsd must be a positive number" }, { status: 400 })
    }

    const admin = createAdminClient()
    const available = await readNexusMainAvailableUsd(admin, user.id)
    if (available < requiredUsd) {
      return NextResponse.json(
        {
          error: "Insufficient Nexus Main Account balance for this operation.",
          code: "INSUFFICIENT_NEXUS_MAIN",
          requiredUsd,
          available_balance: available,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      available_balance: available,
      requiredUsd,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
