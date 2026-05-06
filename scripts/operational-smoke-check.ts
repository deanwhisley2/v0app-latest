#!/usr/bin/env npx tsx
/**
 * Machine-verifiable operational smoke — run on the server after deploy (with .env.local loaded).
 * Usage: npm run operational:smoke
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *           NEXUS_EXPERT_FALLBACK_USER_ID (same user you trade under),
 * optional: SMOKE_TEST_SYMBOL (default BTCUSDT).
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { getResumeGate } from "../lib/startup-recovery"
import { resolveAuthoritativeMarketState } from "../lib/market-state-authority"
import { requestGovernanceApproval } from "../lib/global-execution-governor"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

type Section = { name: string; ok: boolean; detail: string }

function section(name: string, ok: boolean, detail: string): Section {
  return { name, ok, detail }
}

function printBanner(title: string) {
  console.log(`\n=== ${title} ===`)
}

async function main() {
  const failures: string[] = []
  const sections: Section[] = []

  printBanner("SUPABASE ADMIN")
  try {
    createAdminClient()
    sections.push(section("admin_client", true, "createAdminClient OK"))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sections.push(section("admin_client", false, msg))
    failures.push("admin_client")
  }

  const userId = process.env.NEXUS_EXPERT_FALLBACK_USER_ID?.trim()
  if (!userId) {
    sections.push(section("user_id", false, "NEXUS_EXPERT_FALLBACK_USER_ID missing"))
    failures.push("user_id")
  } else {
    sections.push(section("user_id", true, userId))
  }

  printBanner("STARTUP GATE")
  try {
    const gate = await getResumeGate()
    const ok = gate.status === "SAFE_TO_RESUME"
    sections.push(section("resume_gate", ok, `status=${gate.status} unresolved=${gate.unresolvedCount} reason=${gate.reason ?? "-"}`))
    if (!ok) failures.push("resume_gate")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sections.push(section("resume_gate", false, msg))
    failures.push("resume_gate")
  }

  printBanner("AUTHORITATIVE MARKET STATE")
  try {
    const m = await resolveAuthoritativeMarketState({ consumer: "operational-smoke", minRefreshMs: 10_000 })
    sections.push(
      section(
        "market_state",
        true,
        `regime=${m.marketRegime} systemic=${m.systemicRiskState} degraded=${m.degraded}${m.degradeReason ? ` reason=${m.degradeReason.slice(0, 120)}` : ""}`,
      ),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sections.push(section("market_state", false, msg))
    failures.push("market_state")
  }

  printBanner("GOVERNANCE APPROVAL (SELL smoke — no quote)")
  const sym = (process.env.SMOKE_TEST_SYMBOL ?? "BTCUSDT").trim().toUpperCase()
  if (userId) {
    try {
      const gov = await requestGovernanceApproval({
        workerId: `smoke_${Date.now()}`,
        lane: "operational-smoke-check",
        userId,
        symbol: sym.endsWith("USDT") ? sym : `${sym}USDT`,
        action: "SELL",
      })
      sections.push(section("governance_sell_probe", true, `status=${gov.status} approved=${gov.approved}`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sections.push(section("governance_sell_probe", false, msg))
      failures.push("governance_sell_probe")
    }
  }

  printBanner("PERSISTENCE / SCHEMA SPOT CHECKS")
  const tables = [
    "StartupRecoveryState",
    "LiveStructureState",
    "EngineGovernanceState",
    "GovernanceApprovalLog",
    "MarketStructureSnapshot",
    "EpistemicCalibrationSnapshot",
  ]
  try {
    const admin = createAdminClient()
    for (const t of tables) {
      try {
        const { error } = await admin.from(t).select("*", { head: true, count: "exact" }).limit(1)
        if (error) {
          sections.push(section(`table:${t}`, false, error.message))
          failures.push(`table:${t}`)
        } else {
          sections.push(section(`table:${t}`, true, "readable"))
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        sections.push(section(`table:${t}`, false, msg))
        failures.push(`table:${t}`)
      }
    }
  } catch {
    /* admin already failed above */
  }

  printBanner("DETAIL ROWS")
  for (const s of sections) {
    const tag = s.ok ? "PASS" : "FAIL"
    console.log(`[${tag}] ${s.name}: ${s.detail}`)
  }

  printBanner("SUMMARY")
  if (failures.length === 0) {
    console.log("OVERALL: PASS — all sections OK")
    process.exit(0)
  }
  console.log(`OVERALL: FAIL — ${failures.length} issue(s): ${failures.join(", ")}`)
  process.exit(1)
}

void main()
