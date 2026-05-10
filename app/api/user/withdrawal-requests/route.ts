import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"

/** Current user’s withdrawal requests (audit / status). */
export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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
