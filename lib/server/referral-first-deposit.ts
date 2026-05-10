import type { SupabaseClient } from "@supabase/supabase-js"
import { NEXUS_REFERRAL_RATE_ON_FIRST_DEPOSIT, roundUsd2 } from "@/lib/nexus-financial-policy"
import { recordFinancialEvent } from "@/lib/server/financial-events"

/**
 * When a referee receives a qualifying credit to Nexus Main (first tracked deposit),
 * credit the referrer once from platform treasury — not from any Level 5 user wallet.
 */
export async function tryCreditReferrerFirstDepositBonus(
  sb: SupabaseClient,
  refereeUserId: string,
  depositAmountUsd: number
): Promise<void> {
  if (!(depositAmountUsd > 0)) return

  try {
    const { data: referee, error: pErr } = await sb
      .from("profiles")
      .select("id,referred_by,referrer_first_deposit_bonus_at")
      .eq("id", refereeUserId)
      .maybeSingle()

    if (pErr || !referee) return

    const referrerId = referee.referred_by as string | null | undefined
    if (!referrerId || referrerId === refereeUserId) return

    if (referee.referrer_first_deposit_bonus_at) return

    const bonus = roundUsd2(depositAmountUsd * NEXUS_REFERRAL_RATE_ON_FIRST_DEPOSIT)
    if (!(bonus > 0)) return

    const now = new Date().toISOString()

    const { data: refBal } = await sb
      .from("user_balances")
      .select("available_balance")
      .eq("user_id", referrerId)
      .maybeSingle()
    const cur = Number(refBal?.available_balance ?? 0)

    await sb.from("user_balances").upsert(
      {
        user_id: referrerId,
        available_balance: roundUsd2(cur + bonus),
        last_updated: now,
      },
      { onConflict: "user_id" }
    )

    await sb
      .from("profiles")
      .update({ referrer_first_deposit_bonus_at: now, updated_at: now })
      .eq("id", refereeUserId)

    await recordFinancialEvent({
      userId: referrerId,
      eventType: "referral_first_deposit_bonus",
      category: "funding",
      amount: bonus,
      feeAmount: 0,
      balanceSource: "platform_treasury",
      balanceDestination: "available_balance",
      status: "completed",
      actorType: "system",
      summary: `Referral reward (${(NEXUS_REFERRAL_RATE_ON_FIRST_DEPOSIT * 100).toFixed(1)}% of referee deposit) — treasury credit.`,
      metadata: {
        refereeUserId,
        depositUsd: depositAmountUsd,
        rate: NEXUS_REFERRAL_RATE_ON_FIRST_DEPOSIT,
      },
    })
  } catch (e) {
    console.warn("[referral-first-deposit]", e instanceof Error ? e.message : String(e))
  }
}
