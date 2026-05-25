import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import {
  buildAdminPayoutSummary,
  getOrCreateSecurityProfile,
} from "@/lib/server/user-security-profile-service"
import { maskSensitiveValue } from "@/lib/nexus-security-code"

/** L5 only: full security profile + compliance history for remote help. */
export async function GET(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { userId } = await ctx.params
    const uid = typeof userId === "string" ? userId.trim() : ""
    if (!uid) return NextResponse.json({ error: "userId required." }, { status: 400 })

    const admin = createAdminClient()
    const profile = await getOrCreateSecurityProfile(admin, uid)

    const { data: appeals } = await admin
      .from("security_change_requests")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100)

    const { data: threads } = await admin
      .from("operational_support_threads")
      .select("id,category,status,created_at,resolved_at,escalated")
      .eq("user_id", uid)
      .in("category", ["security_update", "security", "appeal"])
      .order("created_at", { ascending: false })
      .limit(50)

    return NextResponse.json({
      profile: {
        hasSecurityCode: Boolean(profile.security_code_hash),
        payoutMethod: profile.payout_method,
        depositNumber: profile.deposit_number
          ? maskSensitiveValue(profile.deposit_number, "phone")
          : null,
        withdrawalNumber: profile.withdrawal_number
          ? maskSensitiveValue(profile.withdrawal_number, "phone")
          : null,
        cryptoWallet: profile.crypto_wallet
          ? maskSensitiveValue(profile.crypto_wallet, "wallet")
          : null,
        lastSensitiveChangeAt: profile.last_sensitive_change_at,
        cooldownUntil: profile.cooldown_until,
        payoutSummary: buildAdminPayoutSummary(profile),
      },
      appeals: appeals ?? [],
      securityThreads: threads ?? [],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
