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
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")?.trim()

    const selectCols =
      "id,amount,processing_fee_amount,payout_amount,processing_fee_rate,currency_context,amount_input_local,input_currency,status,payout_status,transaction_ref,created_at,reviewed_at,metadata"

    if (id) {
      const { data: one, error: oneErr } = await admin
        .from("withdrawal_requests")
        .select(selectCols)
        .eq("user_id", user.id)
        .eq("id", id)
        .maybeSingle()
      if (oneErr) throw new Error(oneErr.message)
      return NextResponse.json({ request: one ?? null })
    }

    const { data, error } = await admin
      .from("withdrawal_requests")
      .select(selectCols)
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
