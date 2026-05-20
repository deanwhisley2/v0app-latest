/**
 * Re-localize notification title/body stored in English at write time.
 * Used at read/present time with the viewer's active `t()`.
 */

const EXACT_TITLE_KEY: Record<string, string> = {
  "Funding approved": "notifications.customer.fundingApprovedTitle",
  "Deposit credited": "notifications.customer.fundingApprovedTitle",
  "Funding declined": "notifications.customer.fundingDeclinedTitle",
  "Deposit declined": "notifications.customer.fundingDeclinedTitle",
  "Funding request declined": "notifications.customer.fundingRejectedTitle",
  "Funding under review": "notifications.customer.fundingHeldTitle",
  "Deposit under review": "notifications.customer.fundingHeldTitle",
  "Funding request closed": "notifications.customer.fundingResolvedTitle",
  "Funding submitted": "notifications.customer.fundingSubmittedTitle",
  "Deposit received": "notifications.customer.fundingSubmittedTitle",
  "Funds credited to your balance": "notifications.customer.fundsCreditedTitle",
  "Balance credited": "notifications.customer.fundsCreditedTitle",
  "First deposit bonus credited": "notifications.launch.refereeBonusTitle",
  "Bonus credited": "notifications.launch.refereeBonusTitle",
  "Referral reward credited": "notifications.launch.referrerBonusTitle",
  "Referral reward": "notifications.launch.referrerBonusTitle",
  "Withdrawal submitted": "notifications.withdrawal.submittedTitle",
  "Withdrawal received": "notifications.withdrawal.submittedTitle",
  "Crypto deposit received": "notifications.crypto.depositReceivedTitle",
  "Crypto deposit credited": "notifications.crypto.depositCreditedTitle",
  "Welcome to Nexus Pro": "notifications.launch.welcomeTitle",
  "Welcome": "notifications.launch.welcomeTitle",
  "New referral joined": "notifications.launch.newReferralTitle",
  "New referral": "notifications.launch.newReferralTitle",
  "Copy trade started": "notifications.trade.copyStartedTitle",
  "Recovery-hold possible": "notifications.trade.recoveryHoldTitle",
  "Recovery hold": "notifications.trade.recoveryHoldTitle",
  "Auto-adjust enabled": "notifications.trade.autoAdjustOnTitle",
  "Auto-adjust on": "notifications.trade.autoAdjustOnTitle",
  "Auto-adjust disabled": "notifications.trade.autoAdjustOffTitle",
  "Auto-adjust off": "notifications.trade.autoAdjustOffTitle",
  "Force pull-out completed": "notifications.trade.forcePulloutTitle",
  "Pull-out completed": "notifications.trade.forcePulloutTitle",
  "Fees trace (copy)": "notifications.trade.forcePulloutFeesTitle",
  "Fees summary": "notifications.trade.forcePulloutFeesTitle",
  "Sign in required": "notifications.trade.signInRequiredTitle",
  "Could not sync": "notifications.trade.syncFailedTitle",
  "Account update": "notifications.inbox.accountUpdateTitle",
  "Finished": "notifications.trade.fixedFinishedTitle",
  "Completed": "notifications.trade.copyCycleTitle",
  "Active": "notifications.trade.scheduleActiveTitle",
  "Failed": "notifications.trade.copySettlementFailTitle",
  "Desk payment settled": "notifications.retailer.deskSettledTitle",
}

const EXACT_BODY_KEY: Record<string, string> = {
  "Approved. Credited.": "notifications.customer.fundingApprovedBody",
  "Rejected.": "notifications.customer.fundingRejectedBody",
  "Under review.": "notifications.customer.fundingHeldBody",
  "Submitted.": "notifications.customer.fundingSubmittedBody",
  "Pending review.": "notifications.customer.fundingSubmittedBody",
  "Funding request closed.": "notifications.customer.fundingResolvedBody",
  "Closed.": "notifications.customer.fundingResolvedBody",
  "Credited.": "notifications.customer.fundingApprovedHint",
  "Transfer completed.": "notifications.center.detailBalancePlain",
  "Your account is live. Fund your wallet to start trading. Referral rewards are active during the current promotional cycle.":
    "notifications.launch.welcomeBody",
  "Someone registered with your referral ID. Rewards apply after they fund and trade.":
    "notifications.launch.newReferralBody",
  "Sign in to sync copy-trade preferences to your account.":
    "notifications.trade.signInRequiredBody",
  "Sign in to sync copy-trade preferences.": "notifications.trade.signInRequiredBody",
  "Server rejected metadata update.": "notifications.trade.syncFailedBody",
  "Preferences were not saved. Try again.": "notifications.trade.syncFailedBody",
  "Network error. Try again.": "notifications.trade.networkErrorBody",
  "You disabled recovery continuation toward the auto target.":
    "notifications.trade.autoAdjustOffBody",
  "If the desk is underwater, capital may stay in play briefly to avoid unnecessary damage; force pull-out remains available.":
    "notifications.trade.recoveryHoldBody",
  "Desk may hold through drawdowns toward a modeled +5% exit (then withdrawal fee). Not insured.":
    "notifications.trade.autoAdjustOnBody",
  "Settlement incomplete. Refresh or force pull-out.": "notifications.trade.copySettlementFailMessage",
}

const BODY_REFEREE_BONUS_LONG_RE =
  /^Your promotional-cycle bonus of (.+) has been credited to your main balance\.$/
const BODY_REFEREE_BONUS_SHORT_RE = /^(.+) bonus credited\.$/
const BODY_REFERRER_BONUS_LONG_RE =
  /^You earned (.+) from a referral's first deposit during the current promotional cycle\.$/
const BODY_REFERRER_BONUS_SHORT_RE = /^(.+) referral reward\.$/
const BODY_FUNDS_CREDITED_LONG_RE = /^(.+) has been added to your Nexus Main(?: balance)?\./
const BODY_FUNDS_CREDITED_SHORT_RE = /^(.+) credited\.$/
const BODY_LOCAL_APPROVED_LONG_RE = /^Approved · (.+)\. Credited\.$/
const BODY_LOCAL_APPROVED_SHORT_RE = /^(.+) credited\.$/
const BODY_WITHDRAWAL_RE = /^(.+) (?:withdrawal is )?pending\.$/
const BODY_CRYPTO_VERIFY_RE = /^(.+) processing\.$/
const BODY_CRYPTO_VERIFY_LEGACY_RE = /^USDT deposit verifying \(declared .+\)\./
const BODY_CRYPTO_CREDITED_RE = /^Your USDT deposit of .+ USD has been credited/
const BODY_CRYPTO_CREDITED_SHORT_RE = /^(.+) credited\.$/
const BODY_DECLINED_NOTE_RE = /^Funding declined\. (.+)$/
const BODY_DECLINED_SHORT_RE = /^Declined\. (.+)$/
const BODY_HELD_NOTE_RE = /^Request under review\. (.+)$/
const BODY_HELD_SHORT_RE = /^Under review\. (.+)$/
const BODY_COPY_STARTED_RE =
  /^(.+) allocated from Nexus Main to (.+)\. 24h aggressive cycle — uninsured, separate from fixed insurance\.$/
const BODY_COPY_STARTED_SHORT_RE = /^(.+) allocated to (.+)\. 24-hour cycle — uninsured, separate from fixed insurance\.$/
const BODY_FORCE_PULLOUT_RE =
  /^Nexus Main \+(.+); container liquid \+(.+) \(modeled cancel .+%, withdrawal .+%\)\.$/
const BODY_FORCE_PULLOUT_SHORT_RE =
  /^Main \+(.+) · Container earnings \+(.+) \(fees applied per policy\)\.$/
const BODY_FORCE_FEES_RE = /^Cancel ≈ (.+), withdrawal ≈ (.+)\.$/
const BODY_FORCE_FEES_SHORT_RE = /^Cancel (.+) · Withdrawal (.+)\.$/
const BODY_FIX_ACTIVE_RE = /^(.+) · (\d+) months?$/
const BODY_FIX_ACTIVE_SHORT_RE = /^(.+) · (\d+) mois$/
const BODY_COPY_CYCLE_RE = /^Principal \+(.+) · Pocket \+(.+)$/

export function localizeStoredNotificationTitle(title: string, t: (key: string) => string): string {
  const trimmed = title.trim()
  const key = EXACT_TITLE_KEY[trimmed]
  return key ? t(key) : trimmed
}

export function localizeStoredNotificationBody(body: string, t: (key: string) => string): string {
  const trimmed = body.trim()
  const exact = EXACT_BODY_KEY[trimmed]
  if (exact) return t(exact)

  const approvedLocal =
    trimmed.match(BODY_LOCAL_APPROVED_SHORT_RE) ?? trimmed.match(BODY_LOCAL_APPROVED_LONG_RE)
  if (approvedLocal) {
    return t("notifications.customer.fundingApprovedBodyLocal").replace("{{amount}}", approvedLocal[1])
  }
  const refereeBonus =
    trimmed.match(BODY_REFEREE_BONUS_SHORT_RE) ?? trimmed.match(BODY_REFEREE_BONUS_LONG_RE)
  if (refereeBonus) {
    return t("notifications.launch.refereeBonusBody").replace("{{amount}}", refereeBonus[1])
  }
  const referrerBonus =
    trimmed.match(BODY_REFERRER_BONUS_SHORT_RE) ?? trimmed.match(BODY_REFERRER_BONUS_LONG_RE)
  if (referrerBonus) {
    return t("notifications.launch.referrerBonusBody").replace("{{amount}}", referrerBonus[1])
  }
  const fundsCredited =
    trimmed.match(BODY_FUNDS_CREDITED_SHORT_RE) ?? trimmed.match(BODY_FUNDS_CREDITED_LONG_RE)
  if (fundsCredited) {
    return t("notifications.customer.fundsCreditedBody").replace("{{amount}}", fundsCredited[1])
  }
  const withdrawal = trimmed.match(BODY_WITHDRAWAL_RE)
  if (withdrawal) {
    return t("notifications.withdrawal.submittedBody").replace("{{amount}}", withdrawal[1])
  }
  const cryptoVerify =
    trimmed.match(BODY_CRYPTO_VERIFY_RE) ?? (BODY_CRYPTO_VERIFY_LEGACY_RE.test(trimmed) ? ["", "—"] : null)
  if (cryptoVerify) {
    return t("notifications.crypto.depositVerifyingBody").replace("{{amount}}", cryptoVerify[1] || "—")
  }
  if (BODY_CRYPTO_CREDITED_RE.test(trimmed)) {
    return t("notifications.crypto.depositCreditedBody").replace("{{amount}}", "—")
  }
  const declined = trimmed.match(BODY_DECLINED_SHORT_RE) ?? trimmed.match(BODY_DECLINED_NOTE_RE)
  if (declined) {
    return t("notifications.customer.fundingDeclinedBody").replace("{{note}}", declined[1])
  }
  const held = trimmed.match(BODY_HELD_SHORT_RE) ?? trimmed.match(BODY_HELD_NOTE_RE)
  if (held) {
    return t("notifications.customer.fundingHeldBodyNote").replace("{{note}}", held[1])
  }
  const copyStarted = trimmed.match(BODY_COPY_STARTED_SHORT_RE) ?? trimmed.match(BODY_COPY_STARTED_RE)
  if (copyStarted) {
    return t("notifications.trade.copyStartedBody")
      .replace("{{amount}}", copyStarted[1])
      .replace("{{trader}}", copyStarted[2])
  }
  const forcePull = trimmed.match(BODY_FORCE_PULLOUT_SHORT_RE) ?? trimmed.match(BODY_FORCE_PULLOUT_RE)
  if (forcePull) {
    return t("notifications.trade.forcePulloutBody")
      .replace("{{main}}", forcePull[1].trim())
      .replace("{{pocket}}", forcePull[2].trim())
  }
  const forceFees = trimmed.match(BODY_FORCE_FEES_SHORT_RE) ?? trimmed.match(BODY_FORCE_FEES_RE)
  if (forceFees) {
    return t("notifications.trade.forcePulloutFeesBody")
      .replace("{{cancel}}", forceFees[1].trim())
      .replace("{{withdraw}}", forceFees[2].trim())
  }
  const fixActive = trimmed.match(BODY_FIX_ACTIVE_RE)
  if (fixActive) {
    return t("notifications.trade.scheduleActiveMessage")
      .replace("{{amount}}", fixActive[1])
      .replace("{{months}}", fixActive[2])
  }
  const copyCycle = trimmed.match(BODY_COPY_CYCLE_RE)
  if (copyCycle) {
    return t("notifications.trade.copyCycleMessage")
      .replace("{{mainAdd}}", copyCycle[1].trim())
      .replace("{{pocketAdd}}", copyCycle[2].trim())
  }

  return trimmed
}
