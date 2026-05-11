#!/usr/bin/env npx tsx
/**
 * FINANCIAL SECURITY ACCEPTANCE TESTS
 *
 * Requires:
 * - Migration applied in Supabase (balances/ledger + atomic_balance_update)
 * - Server env vars for admin client:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Configure test identities:
 * - FINSEC_TEST_USER_ID (UUID)
 * - FINSEC_TEST_INITIATED_BY (UUID) defaults to FINSEC_TEST_USER_ID
 *
 * Run:
 *   npx tsx scripts/test-financial-security.ts
 */
import * as dotenv from "dotenv"
import * as path from "path"
import { treasury, type WalletType } from "@/lib/financial/treasury-authority"

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

function requireEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

async function resetWallet(userId: string, walletType: WalletType, initiatedBy: string) {
  // Hard reset by debiting down to 0 (idempotent for tests).
  const bal = await treasury.getBalance(userId, walletType)
  if (bal > 0) {
    const out = await treasury.executeMovement({
      userId,
      walletType,
      operation: "DEBIT",
      amount: bal,
      referenceId: `finsec_reset_${walletType}`,
      reason: "FINSEC test reset",
      initiatedBy,
    })
    if (!out.success) throw new Error(`Reset failed: ${out.error}`)
  }
}

async function test1_RetailerCannotApproveBeyondBalance(userId: string, initiatedBy: string) {
  await resetWallet(userId, "RETAIL", initiatedBy)

  // Credit 3.9M then attempt to validate 7M
  const credit = await treasury.executeMovement({
    userId,
    walletType: "RETAIL",
    operation: "CREDIT",
    amount: 3_900_000,
    referenceId: "finsec_seed_retail",
    reason: "FINSEC seed",
    initiatedBy,
  })
  if (!credit.success) throw new Error(`Seed credit failed: ${credit.error}`)

  const validation = await treasury.validateSufficientBalance({
    userId,
    walletType: "RETAIL",
    requiredAmount: 7_000_000,
  })
  if (validation.allowed !== false) throw new Error("TEST 1 FAILED: allowed beyond balance")
  console.log("✓ Test 1 passed (insufficient balance blocked)")
}

async function test2_DebitBlocksAtRPC(userId: string, initiatedBy: string) {
  await resetWallet(userId, "NEXUS_MAIN", initiatedBy)

  const seed = await treasury.executeMovement({
    userId,
    walletType: "NEXUS_MAIN",
    operation: "CREDIT",
    amount: 1000,
    referenceId: "finsec_seed_main",
    reason: "FINSEC seed",
    initiatedBy,
  })
  if (!seed.success) throw new Error(`Seed failed: ${seed.error}`)

  const debit = await treasury.executeMovement({
    userId,
    walletType: "NEXUS_MAIN",
    operation: "DEBIT",
    amount: 2000,
    referenceId: "finsec_overdebit",
    reason: "FINSEC overdebit should fail",
    initiatedBy,
  })
  if (debit.success) throw new Error("TEST 2 FAILED: RPC allowed debit beyond balance")
  console.log("✓ Test 2 passed (RPC enforces conservation)")
}

async function runAllTests() {
  const userId = requireEnv("FINSEC_TEST_USER_ID")
  const initiatedBy = (process.env.FINSEC_TEST_INITIATED_BY || userId).trim()

  console.log("Running Financial Security Tests…\n")
  await test1_RetailerCannotApproveBeyondBalance(userId, initiatedBy)
  await test2_DebitBlocksAtRPC(userId, initiatedBy)
  console.log("\n✅ ALL TESTS PASSED — Financial security enforced")
}

runAllTests().catch((e) => {
  console.error("\n❌ FINSEC TESTS FAILED")
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

