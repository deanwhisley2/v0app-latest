import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"

/** Current user’s withdrawal requests (audit / status). */
export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("withdrawal_requests")
      .select("id,amount,currency_context,status,transaction_ref,created_at,reviewed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)
    return NextResponse.json({ requests: data ?? [] })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
