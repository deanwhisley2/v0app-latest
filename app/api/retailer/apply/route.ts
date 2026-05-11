import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabaseAdmin"

type ApplyBody = {
  fullName?: string
  region?: string
  phone?: string
  paymentMethod?: string
  whatsappContact?: string
}

function normalize(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as ApplyBody
    const fullName = normalize(body.fullName, 120)
    const region = normalize(body.region, 24).toUpperCase()
    const phone = normalize(body.phone, 48)
    const paymentMethod = normalize(body.paymentMethod, 80)
    const whatsappContact = normalize(body.whatsappContact, 48)

    if (!fullName || !region || !phone || !whatsappContact) {
      return NextResponse.json(
        { error: "fullName, region, phone, and whatsappContact are required." },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const retailerCode = `RET-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    const { data, error } = await admin
      .from("retailer_applications")
      .insert({
        user_id: user.id,
        full_name: fullName,
        region,
        phone,
        payment_method: paymentMethod || null,
        whatsapp_contact: whatsappContact,
        status: "PENDING",
      })
      .select("id")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Keep role profile sync warm for admin verification workflows.
    const { error: upsertUserError } = await admin
      .from("users")
      .upsert(
        {
          id: user.id,
          role: "USER",
          region,
          retailer_code: retailerCode,
          verified: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id")
      .single()
    if (upsertUserError) {
      return NextResponse.json({ error: upsertUserError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      applicationId: data.id,
      retailerCode,
      message: "Application submitted. Contact admin on WhatsApp for verification.",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
