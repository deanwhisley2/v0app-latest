import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { routeErrorMessage } from "@/lib/server/route-error-message"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { buildStartupBonusOnboardingStatus } from "@/lib/server/startup-bonus-onboarding"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response

    const admin = createAdminClient()
    const status = await buildStartupBonusOnboardingStatus(admin, auth.user.id)
    return NextResponse.json({ ok: true, ...status })
  } catch (e) {
    console.error("[startup-onboarding GET]", e)
    return NextResponse.json({ error: routeErrorMessage(e) }, { status: 500 })
  }
}
