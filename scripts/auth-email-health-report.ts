#!/usr/bin/env npx tsx
/**
 * Auth email delivery health — registrations vs verification codes vs delivery events.
 * Usage: npx tsx scripts/auth-email-health-report.ts [hours]
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { getAuthEmailDeliverabilityDashboard } from "../lib/server/auth-email-deliverability"
import { createAdminClient } from "../lib/supabaseAdmin"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

async function main() {
  const hours = Number.parseInt(process.argv[2] ?? "48", 10) || 48
  const dashboard = await getAuthEmailDeliverabilityDashboard(hours)
  console.log(JSON.stringify(dashboard, null, 2))

  const admin = createAdminClient()
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
  const { data: gaps } = await admin
    .from("profiles")
    .select("id, full_name, created_at, is_verified")
    .gte("created_at", since)
    .eq("is_verified", false)
    .order("created_at", { ascending: false })
    .limit(30)

  console.log("\n--- Unverified signups (sample) ---")
  for (const p of gaps ?? []) {
    const { data: auth } = await admin.auth.admin.getUserById(p.id)
    const email = auth.user?.email ?? ""
    if (!email.includes("@") || email.includes("@accounts.nexuspro.it.com")) continue
    const { data: v } = await admin
      .from("email_verifications")
      .select("created_at")
      .eq("user_id", p.id)
      .order("created_at", { ascending: false })
      .limit(1)
    const gapMin = v?.[0]
      ? Math.round(
          (new Date(v[0].created_at).getTime() - new Date(p.created_at).getTime()) / 60000,
        )
      : null
    console.log(
      p.created_at?.slice(0, 19),
      p.full_name,
      email,
      v?.[0] ? `first_code +${gapMin}m` : "NO_CODE_ROW",
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
