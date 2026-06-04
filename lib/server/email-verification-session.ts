import { createAdminClient } from "@/lib/supabaseAdmin"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"

export type CreateVerificationSessionResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; status: number }

/** After email is confirmed, establish SSR auth cookies (same pattern as login-code flow). */
export async function createAuthSessionForEmail(
  emailNormalized: string,
): Promise<CreateVerificationSessionResult> {
  const admin = createAdminClient()
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: emailNormalized,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("[verify-code] generateLink:", linkError?.message)
    return { ok: false, error: "Could not start session.", status: 500 }
  }

  const supabase = await createRouteHandlerSupabaseClient()
  const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  })

  if (verifyError || !authData.session?.user) {
    console.error("[verify-code] verifyOtp:", verifyError?.message)
    return { ok: false, error: "Could not complete sign-in.", status: 500 }
  }

  return { ok: true, userId: authData.session.user.id }
}
