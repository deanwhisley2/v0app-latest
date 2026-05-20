#!/usr/bin/env npx tsx
/**
 * Congo corridor ops: clean legacy UGX-style notifications/credits, re-credit in CDF display.
 *
 * Usage:
 *   npx tsx scripts/congo-reconcile-customer-account.ts --email <email> --ensure-country CD
 *   npx tsx scripts/congo-reconcile-customer-account.ts --email <email> --clean-notifications
 *   npx tsx scripts/congo-reconcile-customer-account.ts --email <email> --reverse-manual-credits
 *   npx tsx scripts/congo-reconcile-customer-account.ts --email <email> --credit-usd 580 --apply-launch-bonus
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "../lib/auth-users"
import { roundUsd2 } from "../lib/nexus-financial-policy"
import { creditCustomerMainFromTreasuryUsd } from "../lib/server/l5-funding-settlement"
import { adminRetailPoolUserId } from "../lib/server/admin-retail-pool"
import { formatCustomerMoneyForUser } from "../lib/server/customer-money-copy"
import { appendUserAccountNotification } from "../lib/server/user-account-notifications"
import { buildFundsCreditedCustomerCopy } from "../lib/notifications/customer-notification-language"
import { resolveCustomerExperience } from "../lib/congo-customer-experience"
import { customerNotifyT } from "../lib/server/customer-ui-language"
import { applyLaunchFundingPromotions } from "../lib/server/launch-funding-promotions"
import { recordFinancialEvent } from "../lib/server/financial-events"

config({ path: resolve(process.cwd(), ".env.local") })

function treasuryActorId(): string {
  const pool = adminRetailPoolUserId()
  if (pool) return pool
  const env = process.env.NEXUS_TREASURY_SYSTEM_ACTOR_ID?.trim()
  if (env && env.length >= 30) return env
  return "00000000-0000-4000-8000-000000000001"
}

function argFlag(name: string): boolean {
  return process.argv.includes(name)
}

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1]?.trim() ?? null
}

async function main() {
  const email = argValue("--email")
  if (!email) {
    console.error(
      "Usage: npx tsx scripts/congo-reconcile-customer-account.ts --email <email> [--ensure-country CD] [--clean-notifications] [--reverse-manual-credits] [--credit-usd N] [--apply-launch-bonus]",
    )
    process.exit(1)
  }

  const admin = createAdminClient()
  const userId = await findAuthUserIdByEmail(admin, email)
  if (!userId) throw new Error(`User not found: ${email}`)

  if (argFlag("--ensure-country") || argValue("--ensure-country")) {
    const cc = (argValue("--ensure-country") ?? "CD").toUpperCase().slice(0, 2)
    const { error } = await admin
      .from("profiles")
      .update({ funding_country_code: cc, updated_at: new Date().toISOString() })
      .eq("id", userId)
    if (error) throw new Error(error.message)
    console.log(`profile.funding_country_code → ${cc}`)
  }

  if (argFlag("--clean-notifications")) {
    const { data: rows, error } = await admin
      .from("user_account_notifications")
      .select("id,source_kind,source_id,body,title")
      .eq("user_id", userId)
    if (error) throw new Error(error.message)

    const toDrop = (rows ?? []).filter((r) => {
      const sk = String(r.source_kind ?? "")
      const sid = String(r.source_id ?? "")
      const blob = `${r.title ?? ""} ${r.body ?? ""}`.toUpperCase()
      if (sk === "funding_status" && sid.startsWith("manual_local_mm_pending:")) return true
      if (/\bUGX\b/.test(blob)) return true
      if (/finalize local payment|ugx_nominal|manual local mm/i.test(blob)) return true
      return false
    })

    for (const row of toDrop) {
      const { error: delErr } = await admin.from("user_account_notifications").delete().eq("id", row.id)
      if (delErr) throw new Error(delErr.message)
    }
    console.log(`Removed ${toDrop.length} legacy/UGX notifications`)
  }

  if (argFlag("--reverse-manual-credits")) {
    const { data: events, error: evErr } = await admin
      .from("container_balance_events")
      .select("gross_amount,metadata")
      .eq("user_id", userId)
      .eq("event_type", "manual_local_mm_credit")
    if (evErr) throw new Error(evErr.message)

    let reverseUsd = 0
    for (const e of events ?? []) {
      const amt = Number((e as { gross_amount?: number }).gross_amount ?? 0)
      if (amt > 0) reverseUsd += amt
    }
    reverseUsd = roundUsd2(reverseUsd)

    if (reverseUsd > 0) {
      const { data: bal, error: bErr } = await admin
        .from("user_balances")
        .select("available_balance")
        .eq("user_id", userId)
        .maybeSingle()
      if (bErr) throw new Error(bErr.message)
      const cur = Number(bal?.available_balance ?? 0)
      const next = roundUsd2(Math.max(0, cur - reverseUsd))
      const { error: upErr } = await admin
        .from("user_balances")
        .upsert(
          { user_id: userId, available_balance: next, last_updated: new Date().toISOString() },
          { onConflict: "user_id" },
        )
      if (upErr) throw new Error(upErr.message)
      console.log(`Reversed manual_local_mm credits: -${reverseUsd} USD (balance ${cur} → ${next})`)
    } else {
      console.log("No manual_local_mm_credit events to reverse")
    }
  }

  const creditUsd = Number(argValue("--credit-usd") ?? 0)
  if (creditUsd > 0) {
    const referenceId = `congo_corridor_credit:${userId}:v1`
    const result = await creditCustomerMainFromTreasuryUsd(admin, {
      customerUserId: userId,
      amountUsd: creditUsd,
      referenceId,
      adminUserId: treasuryActorId(),
      reason: `Congo corridor credit (${creditUsd} USD normalized)`,
    })

    if (!result.idempotent) {
      const exp = await resolveCustomerExperience(admin, userId)
      const t = customerNotifyT(exp.language)
      const displayFmt = await formatCustomerMoneyForUser(admin, userId, creditUsd)
      const { title, body } = buildFundsCreditedCustomerCopy(displayFmt, t)
      await appendUserAccountNotification(admin, {
        userId,
        sourceKind: "funding_status",
        sourceId: referenceId,
        notificationType: "financial",
        title,
        body,
        nav: { kind: "wallet" },
        metadata: { amount_usd: creditUsd, corridor: "CD", friendly_detail: body },
      })
      await recordFinancialEvent({
        userId,
        eventType: "congo_corridor_credit",
        category: "funding",
        amount: creditUsd,
        feeAmount: 0,
        balanceSource: "platform_treasury",
        balanceDestination: "available_balance",
        status: "completed",
        actorType: "system",
        summary: "Congo corridor credit",
        metadata: { reference_id: referenceId, email },
      })
    }

    if (argFlag("--apply-launch-bonus")) {
      await applyLaunchFundingPromotions(admin, userId, creditUsd, referenceId)
    }

    const displayFmt = await formatCustomerMoneyForUser(admin, userId, creditUsd)
    console.log(
      JSON.stringify(
        {
          ok: true,
          email,
          userId,
          credit_usd: creditUsd,
          display: displayFmt,
          idempotent: Boolean(result.idempotent),
          launch_bonus: argFlag("--apply-launch-bonus"),
        },
        null,
        2,
      ),
    )
    return
  }

  const { data: bal } = await admin
    .from("user_balances")
    .select("available_balance")
    .eq("user_id", userId)
    .maybeSingle()
  console.log(JSON.stringify({ ok: true, email, userId, available_balance: bal?.available_balance }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
