import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { routeErrorMessage } from "@/lib/server/route-error-message"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  getPublicSecurityProfile,
  getSecurityProfileSetupFields,
  setupSecurityProfile,
  verifyUserSecurityCode,
} from "@/lib/server/user-security-profile-service"
import type { NexusPayoutMethod } from "@/lib/nexus-payout-methods"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const admin = createAdminClient()
    const profile = await getPublicSecurityProfile(admin, auth.user.id)
    const setupFields = await getSecurityProfileSetupFields(admin, auth.user.id)
    return NextResponse.json({ profile, setupFields })
  } catch (e) {
    console.error("[security-profile GET]", e)
    return NextResponse.json({ error: routeErrorMessage(e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      security_code?: string
      deposit_number?: string
      withdrawal_number?: string
      deposit_account_names?: string
      withdrawal_account_names?: string
      payout_method?: string
      crypto_wallet?: string
    }
    const admin = createAdminClient()

    if (body.action === "verify") {
      const code = typeof body.security_code === "string" ? body.security_code : ""
      const ok = await verifyUserSecurityCode(admin, auth.user.id, code)
      return NextResponse.json({ ok })
    }

    const code = typeof body.security_code === "string" ? body.security_code : ""
    const deposit = typeof body.deposit_number === "string" ? body.deposit_number : ""
    const withdrawal = typeof body.withdrawal_number === "string" ? body.withdrawal_number : ""
    const methodRaw = typeof body.payout_method === "string" ? body.payout_method.trim() : "mobile_money"
    const payoutMethod: NexusPayoutMethod =
      methodRaw === "crypto_trc20" ? "crypto_trc20" : "mobile_money"

    const profile = await setupSecurityProfile(admin, {
      userId: auth.user.id,
      securityCode: code,
      depositNumber: deposit,
      withdrawalNumber: withdrawal,
      depositAccountNames:
        typeof body.deposit_account_names === "string" ? body.deposit_account_names : undefined,
      withdrawalAccountNames:
        typeof body.withdrawal_account_names === "string" ? body.withdrawal_account_names : undefined,
      payoutMethod,
      cryptoWallet: body.crypto_wallet,
    })
    return NextResponse.json({ ok: true, profile })
  } catch (e) {
    console.error("[security-profile POST]", e)
    const msg = routeErrorMessage(e, "Could not save security details.")
    const status = /already configured|must be exactly|required|invalid|does not match/i.test(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
