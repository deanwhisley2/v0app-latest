import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { routeErrorMessage } from "@/lib/server/route-error-message"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  bindLoginPhone,
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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const admin = createAdminClient()

    if (body.action === "verify") {
      const code = typeof body.security_code === "string" ? body.security_code : ""
      const ok = await verifyUserSecurityCode(admin, auth.user.id, code)
      return NextResponse.json({ ok })
    }

    if (body.action === "bind_login_phone") {
      const phone = typeof body.phone === "string" ? body.phone : ""
      const profile = await bindLoginPhone(admin, { userId: auth.user.id, phoneRaw: phone })
      return NextResponse.json({ ok: true, profile })
    }

    const code = typeof body.security_code === "string" ? body.security_code : ""
    const methodRaw = typeof body.payout_method === "string" ? body.payout_method.trim() : "mobile_money"
    const payoutMethod: NexusPayoutMethod =
      methodRaw === "crypto_trc20" ? "crypto_trc20" : "mobile_money"

    const str = (k: string) => (typeof body[k] === "string" ? body[k] : "")

    const profile = await setupSecurityProfile(admin, {
      userId: auth.user.id,
      securityCode: code,
      mtnDepositNumber: str("mtn_deposit_number") || str("deposit_number"),
      mtnDepositAccountNames: str("mtn_deposit_account_names") || str("deposit_account_names"),
      airtelDepositNumber: str("airtel_deposit_number"),
      airtelDepositAccountNames: str("airtel_deposit_account_names"),
      mtnWithdrawalNumber: str("mtn_withdrawal_number") || str("withdrawal_number"),
      mtnWithdrawalAccountNames: str("mtn_withdrawal_account_names") || str("withdrawal_account_names"),
      airtelWithdrawalNumber: str("airtel_withdrawal_number"),
      airtelWithdrawalAccountNames: str("airtel_withdrawal_account_names"),
      payoutMethod,
      cryptoWallet: typeof body.crypto_wallet === "string" ? body.crypto_wallet : undefined,
    })
    return NextResponse.json({ ok: true, profile })
  } catch (e) {
    console.error("[security-profile POST]", e)
    const msg = routeErrorMessage(e, "Could not save security details.")
    const status = /already configured|must be exactly|required|invalid|does not match/i.test(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
