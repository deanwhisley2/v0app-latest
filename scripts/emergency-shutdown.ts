#!/usr/bin/env npx tsx
/**
 * EMERGENCY SHUTDOWN — stop legacy local trading daemons and optional PM2 workers.
 *
 * This app’s authoritative execution is Wallstreet + Container inside Next.js.
 * Removed daemons: auto-trader, trade-24-7, observation-window, focus observer, background-engine.
 *
 * Usage (must run from repo root — same directory as package.json):
 *   cd /path/to/your-app && npm run emergency:shutdown
 *   # or: cd /path/to/your-app && npx tsx scripts/emergency-shutdown.ts
 */
import * as dotenv from "dotenv"
import * as path from "path"
import { execSync } from "child_process"

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

function run(cmd: string) {
  try {
    execSync(cmd, { stdio: "inherit" })
  } catch {
    /* non-zero exit is ok if process was not running */
  }
}

async function main() {
  console.log("🚨 EMERGENCY SHUTDOWN — NEXUS (operational)")
  console.log("=".repeat(50))

  console.log("\n[1/3] Stopping PM2 apps that may still exist from older deploys…")
  for (const name of [
    "nexus-auto-trader",
    "nexus-observation-window",
    "nexus-focus-observer",
  ]) {
    run(`npx pm2 stop ${name} 2>/dev/null || true`)
    run(`npx pm2 delete ${name} 2>/dev/null || true`)
  }

  console.log("\n[2/3] Sending pkill patterns for removed script entrypoints…")
  const patterns = [
    "auto-trader-1hr",
    "auto-trader-daemon",
    "trade-24-7",
    "execute-live-trade",
    "observation-window",
    "focus-20-observer-daemon",
    "background-engine",
  ]
  for (const p of patterns) {
    run(`pkill -f ${p} 2>/dev/null || true`)
  }

  console.log("\n[3/3] Done. Verify with: npx pm2 ls")
  console.log("If production should keep only `nexus`, run: npm run pm2:restart")
  console.log("=".repeat(50))
}

main().catch(console.error)
