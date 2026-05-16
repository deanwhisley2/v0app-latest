/**
 * Public, customer-facing story Joelin may use. No API keys, no internal yield formulas.
 * Backend scheduling may still use fixed curves in code — that is never quoted to users.
 */

export const NEXUS_PRODUCT_NAME = "Nexus PRO"

/** Withdrawal cadence on earnings (product UI), not headline return %. */
export const CONTAINER_WITHDRAWAL_SUMMARY =
  "Fixed-trade earnings can be released to your container pocket when accrued; locked allocation stays in the trade until maturity or early exit. Pocket withdrawals from Nexus Main are capped at 50% of your liquid total per request. Always read the live labels on your Container screen before you commit funds."

/** Core story: trader + coin hold + daily momentum — no fixed % to the customer. */
export function containerCustomerEarningsStory(): string {
  return [
    "In Container, you lock funds with a trader you choose for a fix window.",
    "That capital is aligned with the coin so the trader can hold conviction through quieter tape and still be ready when momentum improves — that is what “money fixed in a coin” is about.",
    "Earnings follow trader activity during the lock period, not headline rates shown in chat.",
    "You’ll see earnings build day by day on your Container screen: some days steadier, some days stronger — similar to a real desk, so you can feel momentum while you watch progress.",
    "The live Container view is always the source of truth for balances, daily movement, and what you can withdraw as milestones open.",
  ].join("\n")
}

/** @deprecated Use {@link containerCustomerEarningsStory} — same customer-safe copy. */
export function containerReturnFormulaLine(): string {
  return containerCustomerEarningsStory()
}

export const LEVEL_HINT =
  "Your account uses the standard trading tier shown in the app until tier progression is connected to your profile — I won’t promise features above what your screen already unlocks."

/** Funding / desks — assistant-safe wording (never quote other users’ balances or payment numbers). */
export const NEXUS_FUNDING_AND_RETAIL_DESK_HINT = [
  "Level 1 “Add Funds” supports two lanes: Option A sends crypto straight to Nexus’ treasury address (shown in-app when you pick Crypto); Option B picks a verified in-country retailer who already has Nexus liquidity earmarked equal to what you intend to transfer via mobile money.",
  "Retailers shown for local funding only appear if Nexus can debit their main balance internally after they confirm receipt of your outward payment — nothing is fabricated on-platform.",
  "After you tap “Confirm Payment”, the request waits in both your history and the retailer’s incoming queue until they approve or reject.",
  "If you feel stuck, open your funding timeline and tap Appeal — Nexus routes that to admins for dispute review.",
  "Level 2 desks save collection numbers plus optional WhatsApp/call digits; admins still top their liquidity up separately after validating crypto externally (the system credits the requested total plus five percent commission on approval — do not invent numbers yourself in chat).",
  "Retailers temporarily cannot withdraw or start new Container fixed trades whenever they still owe pending inbound confirmations so customer balances stay mirrored safely.",
].join("\n")

/** Non-binding examples for very small fixes when the user asks “how much” — not a guarantee. */
export const CONTAINER_ILLUSTRATIVE_MICRO_USD30 =
  "Illustrative ranges members sometimes see on a ~$30 fix (not a promise; your trader and market month matter): about $6–$9+ over a 1‑month window, about $20–$28+ over 3 months, about $42–$58+ over 6 months — shown as daily slices on the Container screen."

/** Nexus Main wallet, withdrawals, minima — aligns with in-app accounting (USD-normalized internally). */
export const NEXUS_WALLET_AND_WITHDRAWAL_RULES = [
  "Nexus Main is your primary balance inside the product — deposits land here, fixed programs debit here first, and earnings transferred “to main” arrive here.",
  "Before starting a fixed lock, the full stake plus required upfront fees must fit inside Nexus Main; if it doesn’t, reduce the amount or add funds first.",
  "Withdrawals: when you submit one from Wallet, that amount leaves Nexus Main right away and shows under Pending withdrawal until a Level 5 liquidity admin approves or rejects.",
  "Approved payouts complete outside the pending bucket; if rejected, the amount returns to Nexus Main automatically.",
  "Minimum deposit and withdrawal amounts follow internal USD-equivalent rules (your screen shows them in your chosen currency); typical timing hints are about 1–15 minutes for deposits and about 1–2 hours for withdrawals depending on rail, retailer activity, and country.",
].join("\n")

/** Referral sign-up + rewards — treasury-funded; no secrets. */
export const NEXUS_REFERRAL_PROGRAM_GUIDE = [
  "Referrals: optional Referral ID on Create account, or open a friend’s link that ends with ?ref=THEIRCODE so the field fills in.",
  "After you’re signed in, open your avatar menu → Referrals (or Refer to Earn) to copy your referral link and code.",
  "Rewards are designed to trigger once per referred person when their first qualifying deposit credits Nexus Main — one bonus per referee; you can invite many distinct people.",
  "Referral credits come from platform treasury accounting (not from another member’s personal wallet). Exact percentages and eligibility appear in-product when funding completes.",
].join("\n")

/** Early exit / pullout — penalties on stake release; earnings treated separately on-screen. */
export const NEXUS_FIXED_EARLY_EXIT_GUIDE = [
  "Leaving a fixed session before the official lease end uses the Early pullout flow when your trade is backed by a funded server session.",
  "Settlement keeps your accrued session earnings intact as their own bucket: penalties on exit apply to the stake/principal side per the rules shown at confirm time (for example agreement and insurance-style charges from principal release — not double-charging your earned portion).",
  "What ultimately credits back to Nexus Main is shown in the confirmation — always read it before you confirm.",
].join("\n")

/** Risk tiers for fixed access — matches product gating (high level). */
export const NEXUS_FIXED_ACCESS_TIER_HINT =
  "Fixed trader access is tiered: newer tiers typically align with lower-risk desks first; higher tiers unlock additional risk bands when your profile supports it — use the live picker on Container / Fix to see who you can lock with."

/** Where to tap in the app — navigation aid for Joelin. */
export const NEXUS_UI_WHERE_TO_GO = [
  "Wallet (dashboard): Nexus Main, Pending withdrawal, Container balances, Add Funds / Withdraw.",
  "Wallstreet → Container: fixed-term and copy-style flows with on-card rules.",
  "Profile menu (header avatar): Referrals link, edit profile, rewards views.",
  "Settings: exchanges, security, preferences.",
].join("\n")
