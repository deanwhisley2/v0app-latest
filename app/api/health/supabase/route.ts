import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"

/** Verifies server env + one cheap DB round-trip (service role → public.profiles). */
export const dynamic = "force-dynamic"

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return NextResponse.json(
      {
        ok: false,
        supabase: "misconfigured",
        detail: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 503 }
    )
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.from("profiles").select("id").limit(1)
    if (error) {
      return NextResponse.json(
        { ok: false, supabase: "query_failed", detail: error.message },
        { status: 503 }
      )
    }
    return NextResponse.json({
      ok: true,
      supabase: "reachable",
      time: new Date().toISOString(),
    })
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown"
    return NextResponse.json({ ok: false, supabase: "error", detail }, { status: 503 })
  }
}
