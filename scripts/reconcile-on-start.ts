#!/usr/bin/env npx tsx
import { config } from "dotenv"
import { resolve } from "node:path"
import { orchestrateStartupRecovery } from "../lib/startup-recovery"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

async function main() {
  const userId = process.env.NEXUS_EXPERT_FALLBACK_USER_ID?.trim()
  if (!userId) {
    throw new Error("NEXUS_EXPERT_FALLBACK_USER_ID is required for startup recovery runner.")
  }
  const autoRepair = process.env.STARTUP_RECOVERY_AUTO_REPAIR === "1"
  const maxAgeMinutes = Number(process.env.STARTUP_RECOVERY_MAX_AGE_MINUTES ?? "30")
  console.log(
    `[startup-recovery] begin userId=${userId} autoRepair=${autoRepair} maxAgeMinutes=${maxAgeMinutes}`
  )
  const result = await orchestrateStartupRecovery({
    userId,
    autoRepair,
    maxAgeMinutes: Number.isFinite(maxAgeMinutes) ? maxAgeMinutes : 30,
  })
  console.log(
    `[startup-recovery] done gate=${result.gate} unresolved=${result.unresolvedCount} releasedLocks=${result.releasedLocks}`
  )
}

void main().catch((e) => {
  console.error(`[startup-recovery] failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
