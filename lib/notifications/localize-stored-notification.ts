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
}

const EXACT_BODY_KEY: Record<string, string> = {
  "Approved. Credited.": "notifications.customer.fundingApprovedBody",
  "Rejected.": "notifications.customer.fundingRejectedBody",
  "Under review.": "notifications.customer.fundingHeldBody",
  "Submitted.": "notifications.customer.fundingSubmittedBody",
  "Funding request closed.": "notifications.customer.fundingResolvedBody",
  "Credited.": "notifications.customer.fundingApprovedHint",
  "Transfer completed.": "notifications.center.detailBalancePlain",
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
const BODY_CRYPTO_VERIFY_RE = /^USDT deposit verifying \(declared .+\)\./
const BODY_CRYPTO_CREDITED_RE = /^Your USDT deposit of .+ USD has been credited/
const BODY_DECLINED_NOTE_RE = /^Funding declined\. (.+)$/
const BODY_HELD_NOTE_RE = /^Request under review\. (.+)$/

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
  if (BODY_CRYPTO_VERIFY_RE.test(trimmed)) {
    return t("notifications.crypto.depositVerifyingBody").replace("{{amount}}", "—")
  }
  if (BODY_CRYPTO_CREDITED_RE.test(trimmed)) {
    return t("notifications.crypto.depositCreditedBody").replace("{{amount}}", "—")
  }
  const declined = trimmed.match(BODY_DECLINED_NOTE_RE)
  if (declined) {
    return t("notifications.customer.fundingDeclinedBody").replace("{{note}}", declined[1])
  }
  const held = trimmed.match(BODY_HELD_NOTE_RE)
  if (held) {
    return t("notifications.customer.fundingHeldBodyNote").replace("{{note}}", held[1])
  }

  return trimmed
}
