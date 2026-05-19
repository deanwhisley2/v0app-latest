#!/usr/bin/env npx tsx
/**
 * Credit Nexus Main with USD equivalent of a UGX nominal (ops: local MM rails not ready).
 *
 * Usage:
 *   npx tsx scripts/credit-manual-local-mm-ugx-equivalent.ts <email> <ugx_amount>
 *   npx tsx scripts/credit-manual-local-mm-ugx-equivalent.ts --run-may-2026-pending
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "../lib/auth-users"
import { localUnitsToUsd } from "../lib/nexus-fx"
import { creditCustomerMainFromTreasuryUsd } from "../lib/server/l5-funding-settlement"
import { adminRetailPoolUserId } from "../lib/server/admin-retail-pool"
import { formatCustomerMoneyForUser } from "../lib/server/customer-money-copy"
import { appendUserAccountNotification } from "../lib/server/user-account-notifications"
import { recordFinancialEvent } from "../lib/server/financial-events"

config({ path: resolve(process.cwd(), ".env.local") })

const MAY_2026_PENDING: Array<{ email: string; ugx: number }> = [
  { email: "kamberebony@gmail.com", ugx: 2_000_000 },
  { email: "malobacharles@gmail.com", ugx: 1_500_000 },
]

function treasuryActorId(): string {
  const pool = adminRetailPoolUserId()
  if (pool) return pool
  const env = process.env.NEXUS_TREASURY_SYSTEM_ACTOR_ID?.trim()
  if (env && env.length >= 30) return env
  return "00000000-0000-4000-8000-000000000001"
}

async function creditUgxEquivalent(email: string, ugxAmount: number): Promise<void> {
  const amountUsd = localUnitsToUsd(ugxAmount, "UGX")
  if (amountUsd == null || !(amountUsd > 0)) {
    throw new Error(`Invalid UGX amount or FX: ${ugxAmount}`)
  }

  const admin = createAdminClient()
  const userId = await findAuthUserIdByEmail(admin, email)
  if (!userId) throw new Error(`User not found: ${email}`)

  const referenceId = `manual_local_mm_pending:${userId}:ugx${ugxAmount}`
  const reason = `Manual local MM credit (UGX ${ugxAmount.toLocaleString("en-US")} equivalent, pending corridor payment details)`

  const result = await creditCustomerMainFromTreasuryUsd(admin, {
    customerUserId: userId,
    amountUsd,
    referenceId,
    adminUserId: treasuryActorId(),
    reason,
  })

  const displayFmt = await formatCustomerMoneyForUser(admin, userId, amountUsd)

  if (!result.idempotent) {
    await recordFinancialEvent({
      userId,
      eventType: "manual_local_mm_credit",
      category: "funding",
      amount: amountUsd,
      feeAmount: 0,
      balanceSource: "platform_treasury",
      balanceDestination: "available_balance",
      status: "completed",
      actorType: "system",
      summary: reason,
      metadata: { email, ugx_nominal: ugxAmount, reference_id: referenceId },
    })

    await appendUserAccountNotification(admin, {
      userId,
      sourceKind: "funding_status",
      sourceId: referenceId,
      notificationType: "financial",
      title: "Funds credited to your balance",
      body: `${displayFmt} has been added to your Nexus Main while we finalize local payment options for your country.`,
      nav: { kind: "wallet" },
      metadata: { ugx_nominal: ugxAmount, amount_usd: amountUsd, reference_id: referenceId },
    })
  }

  const { data: bal } = await admin
    .from("user_balances")
    .select("available_balance")
    .eq("user_id", userId)
    .maybeSingle()

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        userId,
        ugx_nominal: ugxAmount,
        amount_usd: amountUsd,
        display_equivalent: displayFmt,
        idempotent: Boolean(result.idempotent),
        available_balance: bal?.available_balance,
        reference_id: referenceId,
      },
      null,
      2,
    ),
  )
}

async function main() {
  const arg = process.argv[2]?.trim()
  if (arg === "--run-may-2026-pending") {
    for (const row of MAY_2026_PENDING) {
      await creditUgxEquivalent(row.email, row.ugx)
    }
    return
  }

  const email = arg
  const ugx = Number(process.argv[3] ?? 0)
  if (!email || !(ugx > 0)) {
    console.error(
      "Usage: npx tsx scripts/credit-manual-local-mm-ugx-equivalent.ts <email> <ugx_amount>\n" +
        "   or: npx tsx scripts/credit-manual-local-mm-ugx-equivalent.ts --run-may-2026-pending",
    )
    process.exit(1)
  }
  await creditUgxEquivalent(email, ugx)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
