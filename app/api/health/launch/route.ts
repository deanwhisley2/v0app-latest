import { readFileSync } from "fs"
import { join } from "path"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { NEXUS_TIER_MATRIX_PUBLIC } from "@/lib/nexus-tier-matrix"
import { getPlatformLaunchStatus } from "@/lib/server/platform-launch"
import { getAuthEmailHealthStats } from "@/lib/server/auth-email-delivery-log"

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

/** Written by scripts/deploy-vps-git-archive.sh on the VPS (no .git in extract dir). */
function readDeployRevision(): string | null {
  try {
    const sha = readFileSync(join(process.cwd(), ".deploy-revision"), "utf8").trim()
    return sha.length >= 7 ? sha : null
  } catch {
    return null
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

  let platformLaunch: Awaited<ReturnType<typeof getPlatformLaunchStatus>> | null = null
  if (databasePing) {
    try {
      platformLaunch = await getPlatformLaunchStatus(true)
    } catch {
      platformLaunch = null
    }
  }

  /** Optional: registration / password flows need transactional email; core app shell works without. */
  const brevoSmtpConfigured = Boolean(
    (process.env.BREVO_SMTP_USER?.trim() || process.env.SMTP_USER?.trim()) &&
      (process.env.BREVO_SMTP_PASSWORD?.trim() || process.env.SMTP_PASSWORD?.trim()),
  )
  const optionalServices = {
    brevo_smtp_configured: brevoSmtpConfigured,
    transactional_email_configured: brevoSmtpConfigured,
    next_public_site_url: Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim()),
  }

  const launchReady = Boolean(platformLaunch?.active)

  let authEmailHealth: Awaited<ReturnType<typeof getAuthEmailHealthStats>> | null = null
  if (databasePing) {
    try {
      authEmailHealth = await getAuthEmailHealthStats(24)
    } catch {
      authEmailHealth = null
    }
  }

  return NextResponse.json({
    ok: coreReady && (launchReady || !databasePing),
    service: "nexus-launch",
    platform_launch: platformLaunch,
    time: new Date().toISOString(),
    version: readPackageVersion(),
    checks,
    optional_services: optionalServices,
    auth_email_health: authEmailHealth,
    deployment: {
      node_env: process.env.NODE_ENV ?? "development",
      /** Set by CI or deploy scripts (optional); null on a plain VPS build. */
      git_commit:
        process.env.GITHUB_SHA?.trim() ||
        process.env.GIT_COMMIT?.trim() ||
        process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
        readDeployRevision() ||
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
        "Set BREVO_SMTP_USER + BREVO_SMTP_PASSWORD (Brevo SMTP relay key xsmtpsib…) and optional BREVO_SENDER_EMAIL / BREVO_SENDER_NAME.",
      magic_link_login:
        "Passwordless login: POST /api/auth/request-magic-link (6-digit code email) and POST /api/auth/verify-magic-link with { email, code }. Uses Brevo SMTP.",
    },
  })
}
