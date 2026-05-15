import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { uploadFundingProof } from "@/lib/server/funding-proof-storage"

/** Upload payment screenshot before or after creating a funding request. */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as {
      imageDataUrl?: string
      requestId?: string
    }
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl.trim() : ""
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
    if (!imageDataUrl) {
      return NextResponse.json({ error: "imageDataUrl is required." }, { status: 400 })
    }

    const admin = createAdminClient()
    if (requestId) {
      const { data: row } = await admin
        .from("retailer_fund_requests")
        .select("id")
        .eq("id", requestId)
        .eq("user_id", user.id)
        .maybeSingle()
      if (!row) return NextResponse.json({ error: "Funding request not found." }, { status: 404 })
    }

    const path = await uploadFundingProof(admin, user.id, imageDataUrl, requestId || undefined)

    if (requestId) {
      const { error: upErr } = await admin
        .from("retailer_fund_requests")
        .update({ payment_proof_path: path, updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("user_id", user.id)
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, paymentProofPath: path })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 })
  }
}
