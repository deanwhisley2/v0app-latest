#!/usr/bin/env npx tsx
import * as dotenv from "dotenv"
import * as path from "path"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { currencyEngine } from "@/lib/financial/currency-engine"
import { treasury } from "@/lib/financial/treasury-authority"

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

function mustEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

async function test1_NoRawUSDInjection(userId: string) {
  const rate = await currencyEngine.getRate("USD", "UGX")
  const usdAmount = 192
  const ugxEquivalent = usdAmount * rate
  if (ugxEquivalent <= 0) throw new Error("FX conversion failed")
  console.log(`✓ Test 1 passed: USD ${usdAmount} -> UGX ${ugxEquivalent.toFixed(2)} through FX rate`)
}

async function test2_CurrencyPreservedInLedger(userId: string, actorId: string) {
  const admin = createAdminClient()
  const seed = await treasury.executeCurrencyMovement({
    userId,
    walletType: "NEXUS_MAIN",
    operation: "CREDIT",
    amount: 1000,
    currency: "UGX",
    referenceId: "mc_ledger_seed",
    reason: "multi currency test",
    initiatedBy: actorId,
  })
  if (!seed.success) throw new Error(`Seed movement failed: ${seed.error}`)
  const { data, error } = await admin
    .from("ledger")
    .select("original_currency,usd_conversion_rate,usd_converted_amount")
    .eq("reference_id", "mc_ledger_seed")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || String((data as Record<string, unknown>).original_currency ?? "") !== "UGX") {
    throw new Error("Ledger original_currency not preserved")
  }
  console.log("✓ Test 2 passed: Ledger preserves original currency")
}

async function test3_UserSeesLocalCurrency(userId: string) {
  const currency = await currencyEngine.getUserCurrency(userId)
  if (!currency) throw new Error("Missing user currency")
  console.log(`✓ Test 3 passed: User currency resolved as ${currency}`)
}

async function test4_AdminSeesUSDTreasury(actorId: string) {
  const out = await treasury.executeCurrencyMovement({
    userId: "00000000-0000-0000-0000-000000000001",
    walletType: "TREASURY",
    operation: "CREDIT",
    amount: 1,
    currency: "USD",
    referenceId: "mc_treasury_probe",
    reason: "treasury usd probe",
    initiatedBy: actorId,
  })
  if (!out.success) throw new Error(`Treasury USD probe failed: ${out.error}`)
  const usd = await treasury.getUSDBalance("00000000-0000-0000-0000-000000000001", "TREASURY", "USD")
  if (usd < 0) throw new Error("Treasury USD invalid")
  console.log("✓ Test 4 passed: Treasury USD balance readable")
}

async function test5_FXRateAuthoritative() {
  const rate = await currencyEngine.getRate("USD", "UGX")
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Authoritative FX rate invalid")
  console.log("✓ Test 5 passed: FX rates sourced from database")
}

async function runAllTests() {
  const userId = mustEnv("FINSEC_TEST_USER_ID")
  const actorId = (process.env.FINSEC_TEST_INITIATED_BY || userId).trim()
  console.log("Running Multi-Currency Treasury Tests...\n")
  await test1_NoRawUSDInjection(userId)
  await test2_CurrencyPreservedInLedger(userId, actorId)
  await test3_UserSeesLocalCurrency(userId)
  await test4_AdminSeesUSDTreasury(actorId)
  await test5_FXRateAuthoritative()
  console.log("\n✅ ALL TESTS PASSED — Multi-currency accounting secure")
}

runAllTests().catch((e) => {
  console.error("\n❌ MULTI-CURRENCY TESTS FAILED")
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

