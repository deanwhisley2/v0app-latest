import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { buildRegisterReferralLink, referralCodeForUserId } from "@/lib/referral-code"
import { getPublicSiteOrigin } from "@/lib/site-public-url"

/**
 * Returns stable referral code + share link + referee counts.
 * Ensures referral_code is allocated on first successful read.
 */
export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth

    const admin = createAdminClient()
    const { data: row, error } = await admin
      .from("profiles")
      .select("referral_code, referred_by")
      .eq("id", user.id)
      .maybeSingle()

    if (error) throw new Error(error.message)

    let code = typeof row?.referral_code === "string" && row.referral_code.trim() ? row.referral_code.trim() : ""

    if (!code) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = referralCodeForUserId(attempt === 0 ? user.id : `${user.id}:${attempt}`)
        const { error: upErr } = await admin
          .from("profiles")
          .update({ referral_code: candidate, updated_at: new Date().toISOString() })
          .eq("id", user.id)
        if (!upErr) {
          code = candidate
          break
        }
        const msg = (upErr.message ?? "").toLowerCase()
        if (!msg.includes("unique") && !msg.includes("duplicate")) {
          throw new Error(upErr.message)
        }
      }
    }

    if (!code) code = referralCodeForUserId(user.id)

    const origin = getPublicSiteOrigin(request.url)
    const referralLink = buildRegisterReferralLink(origin, code)

    const { count, error: cErr } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", user.id)

    if (cErr) throw new Error(cErr.message)

    return NextResponse.json({
      referralCode: code,
      referralLink,
      refereeCount: count ?? 0,
      referredByUserId: row?.referred_by ?? null,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
