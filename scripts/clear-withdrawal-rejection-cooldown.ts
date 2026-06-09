/**
 * Ops: clear automated payout hold after consecutive rejections.
 * Usage: npx tsx scripts/clear-withdrawal-rejection-cooldown.ts <user_id|email>
 */
import { config } from "dotenv"
import { resolve } from "path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { clearWithdrawalRejectionCooldown } from "../lib/server/withdrawal-rejection-cooldown"

config({ path: resolve(process.cwd(), ".env.local") })

async function resolveUserId(admin: ReturnType<typeof createAdminClient>, key: string): Promise<string> {
  if (key.includes("@")) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = data.users.find((u) => u.email?.toLowerCase() === key.toLowerCase())
    if (!hit?.id) throw new Error(`No user for email ${key}`)
    return hit.id
  }
  return key
}

async function main() {
  const key = process.argv[2]?.trim()
  if (!key) {
    console.error("Usage: npx tsx scripts/clear-withdrawal-rejection-cooldown.ts <user_id|email>")
    process.exit(1)
  }

  const admin = createAdminClient()
  const userId = await resolveUserId(admin, key)
  await clearWithdrawalRejectionCooldown(admin, userId)
  console.log(JSON.stringify({ ok: true, userId }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
