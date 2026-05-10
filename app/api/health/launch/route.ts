import { readFileSync } from "fs"
import { join } from "path"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { NEXUS_TIER_MATRIX_PUBLIC } from "@/lib/nexus-tier-matrix"

export const dynamic = "force-dynamic"

function readPackageVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8")
    const p = JSON.parse(raw) as { version?: string }
    return typeof p.version === "string" ? p.version : "0.0.0"
  } catch {
    return "0.0.0"
  }
}

/**
 * Launch readiness: env presence + DB ping + documented tier matrix.
 * Safe to expose publicly: no secrets, only booleans for configuration.
 */
export async function GET() {
  const url = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())
  const srk = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  const anon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim())

  let databasePing = false
  if (url && srk) {
    try {
      const admin = createAdminClient()
      const { error } = await admin.from("profiles").select("id").limit(1)
      databasePing = !error
    } catch {
      databasePing = false
    }
  }

  const checks = {
    next_public_supabase_url: url,
    supabase_service_role_configured: srk,
    next_public_supabase_anon_configured: anon,
    database_ping: databasePing,
  }

  const coreReady = url && srk && anon && databasePing

  /** Optional: registration / password flows need Brevo; core app shell works without. */
  const optionalServices = {
    brevo_api_configured: Boolean(process.env.BREVO_API_KEY?.trim()),
    next_public_site_url: Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim()),
  }

  return NextResponse.json({
    ok: coreReady,
    service: "nexus-launch",
    time: new Date().toISOString(),
    version: readPackageVersion(),
    checks,
    optional_services: optionalServices,
    deployment: {
      vercel: Boolean(process.env.VERCEL),
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    /** What each trading tier is supposed to include (aligned with app gating). */
    tiers: NEXUS_TIER_MATRIX_PUBLIC.map((t) => ({
      key: t.key,
      badge: t.badge,
      title: t.title,
      summary: t.summary,
      capabilities: t.capabilities,
    })),
    hints: {
      profile_field:
        "Canonical tier is profiles.trading_user_level (1, 2, or 5) and profiles.retailer_credit_seller for Level-2 desks.",
      health_supabase: "/api/health/supabase",
      health_basic: "/api/health",
      vercel_preview:
        "For PR preview deploys, duplicate NEXT_PUBLIC_SUPABASE_* and SUPABASE_SERVICE_ROLE_KEY from Production to Preview in the Vercel project settings.",
      transactional_email:
        "Set BREVO_API_KEY (and optional BREVO_SENDER_*) on Vercel if sign-up verification emails must work in production.",
    },
  })
}
