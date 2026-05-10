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
      node_env: process.env.NODE_ENV ?? "development",
      /** Set by some CI hosts; null on a plain VPS. */
      git_commit:
        process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
        process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
        process.env.GITHUB_SHA?.trim() ||
        null,
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
      site_url: "Set NEXT_PUBLIC_SITE_URL (e.g. https://nexuspro.it.com) for auth links and metadata.",
      transactional_email:
        "Set BREVO_API_KEY (and optional BREVO_SENDER_*) in production env if sign-up verification emails must be delivered.",
    },
  })
}
