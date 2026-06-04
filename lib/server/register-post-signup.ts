import type { SupabaseClient } from "@supabase/supabase-js"
import { mergeSafeUserMetadata } from "@/lib/server/auth-jwt-metadata"
import { grantNewMemberWelcomeBonus } from "@/lib/server/new-member-campaign"
import {
  notifyLaunchWelcome,
  notifyReferrerNewReferee,
} from "@/lib/server/launch-notifications"
import { attributeRegistrationToCampaign } from "@/lib/server/marketing-campaigns"
import { referralCodeForUserId } from "@/lib/referral-code"
import { isReferralAttributionBlocked } from "@/lib/server/referral-attribution-guard"

export type RegisterPostSignupParams = {
  userId: string
  authEmail: string
  phone: string | null
  fundingCountryCode: string
  referralInvite: string
  campaignSlug: string
  userMetadata: Record<string, unknown>
}

/** Non-blocking enrichment after account row exists — keeps /api/auth/register fast. */
export function runRegisterPostSignup(
  admin: SupabaseClient,
  params: RegisterPostSignupParams,
): void {
  void (async () => {
    const nowIso = new Date().toISOString()
    const { userId, fundingCountryCode, referralInvite, campaignSlug, phone, authEmail } = params

    try {
      const profilePatch: Record<string, unknown> = { updated_at: nowIso }
      if (phone) profilePatch.phone = phone
      if (authEmail) profilePatch.email = authEmail

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
          ...profilePatch,
          referral_code: myReferralCode,
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

/** Grant startup capital on the registration request path (user-visible immediately). */
export async function grantRegisterWelcomeBonus(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const granted = await grantNewMemberWelcomeBonus(admin, userId, "registration")
    if (!granted) {
      console.warn("[register] welcome bonus not granted:", userId)
    }
  } catch (grantErr) {
    console.warn(
      "[register] welcome bonus:",
      grantErr instanceof Error ? grantErr.message : String(grantErr),
    )
  }
}
