import type { SupabaseClient } from "@supabase/supabase-js"
import { mergeSafeUserMetadata } from "@/lib/server/auth-jwt-metadata"
import { grantNewMemberWelcomeBonus } from "@/lib/server/new-member-campaign"
import {
  notifyLaunchWelcome,
  notifyReferrerNewReferee,
} from "@/lib/server/launch-notifications"
import { attributeRegistrationToCampaign } from "@/lib/server/marketing-campaigns"
import { setupSecurityProfile } from "@/lib/server/user-security-profile-service"
import { referralCodeForUserId } from "@/lib/referral-code"
import { isReferralAttributionBlocked } from "@/lib/server/referral-attribution-guard"

export type RegisterPostSignupParams = {
  userId: string
  email: string
  fundingCountryCode: string
  referralInvite: string
  campaignSlug: string
  securityCode: string
  depositNumber: string
  withdrawalNumber: string
  userMetadata: Record<string, unknown>
}

/** Non-blocking enrichment after account row exists — keeps /api/auth/register fast. */
export function runRegisterPostSignup(
  admin: SupabaseClient,
  params: RegisterPostSignupParams,
): void {
  void (async () => {
    const nowIso = new Date().toISOString()
    const { userId, fundingCountryCode, referralInvite, campaignSlug } = params

    try {
      let referredByUserId: string | null = null
      if (referralInvite.length >= 4) {
        const { data: refProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("referral_code", referralInvite)
          .maybeSingle()
        const rid = refProfile?.id as string | undefined
        if (rid && rid !== userId) {
          const blocked = await isReferralAttributionBlocked(admin, rid)
          if (!blocked) referredByUserId = rid
        }
      }

      for (let attempt = 0; attempt < 8; attempt++) {
        const seed = attempt === 0 ? userId : `${userId}:${attempt}`
        const myReferralCode = referralCodeForUserId(seed)
        const patch: Record<string, unknown> = {
          referral_code: myReferralCode,
          updated_at: nowIso,
        }
        if (referredByUserId) patch.referred_by = referredByUserId

        const { error: refErr } = await admin.from("profiles").update(patch).eq("id", userId)
        if (!refErr) break
        const msg = (refErr.message ?? "").toLowerCase()
        if (!msg.includes("unique") && !msg.includes("duplicate")) {
          console.warn("[register-post] referral profile update:", refErr.message)
          break
        }
      }

      if (fundingCountryCode) {
        const { error: fcErr } = await admin
          .from("profiles")
          .update({ funding_country_code: fundingCountryCode, updated_at: nowIso })
          .eq("id", userId)
        if (fcErr) {
          console.warn("[register-post] funding_country_code:", fcErr.message)
        }
      }

      if (referredByUserId) {
        void notifyReferrerNewReferee(admin, referredByUserId, userId)
      }
      void notifyLaunchWelcome(admin, userId, fundingCountryCode)

      const welcomeGranted = await grantNewMemberWelcomeBonus(admin, userId, "registration")
      if (!welcomeGranted) {
        console.warn("[register-post] welcome bonus not granted:", userId)
      }

      if (campaignSlug.length >= 8) {
        try {
          await attributeRegistrationToCampaign({ userId, campaignSlug })
        } catch (campErr) {
          console.warn(
            "[register-post] campaign attribution:",
            campErr instanceof Error ? campErr.message : campErr,
          )
        }
      }

      try {
        await setupSecurityProfile(admin, {
          userId,
          securityCode: params.securityCode,
          mtnDepositNumber: params.depositNumber,
          mtnWithdrawalNumber: params.withdrawalNumber,
          payoutMethod: "mobile_money",
        })
      } catch (secErr) {
        console.warn(
          "[register-post] security profile:",
          secErr instanceof Error ? secErr.message : String(secErr),
        )
      }

      const { error: metaStripErr } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: mergeSafeUserMetadata(params.userMetadata, {
          security_profile_required: true,
        }),
      })
      if (metaStripErr) {
        console.warn("[register-post] user_metadata:", metaStripErr.message)
      }
    } catch (e) {
      console.warn(
        "[register-post] enrichment failed:",
        e instanceof Error ? e.message : String(e),
      )
    }
  })()
}
