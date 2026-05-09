/**
 * Public, customer-facing story Joelin may use. No API keys, no internal yield formulas.
 * Backend scheduling may still use fixed curves in code — that is never quoted to users.
 */

export const NEXUS_PRODUCT_NAME = "Nexus PRO"

/** Withdrawal cadence on earnings (product UI), not headline return %. */
export const CONTAINER_WITHDRAWAL_SUMMARY =
  "When earnings unlock, the Container screen shows withdrawal milestones (for example portions of earnings at 30%, 50%, and 70% on the cadence that matches your 1, 3, or 6‑month plan — plus the optional daily slice on the longest plan). Always read the live labels on your Container screen before you commit funds."

/** Core story: trader + coin hold + daily momentum — no fixed % to the customer. */
export function containerCustomerEarningsStory(): string {
  return [
    "In Container, you lock funds with a trader you choose for a fix window.",
    "That capital is aligned with the coin so the trader can hold conviction through quieter tape and still be ready when momentum improves — that is what “money fixed in a coin” is about.",
    "What you earn comes from how actively and how well that trader trades for you during the lock, not from a headline percentage we quote in chat.",
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
  "After you tap “Confirm payment sent”, the request waits in both your history and the retailer’s incoming queue until they approve or reject.",
  "If you feel stuck, open your funding timeline and tap Appeal — Nexus routes that to admins for dispute review.",
  "Level 2 desks save collection numbers plus optional WhatsApp/call digits; admins still top their liquidity up separately after validating crypto externally (the system credits the requested total plus five percent commission on approval — do not invent numbers yourself in chat).",
  "Retailers temporarily cannot withdraw or start new Container fixed trades whenever they still owe pending inbound confirmations so customer balances stay mirrored safely.",
].join("\n")

/** Non-binding examples for very small fixes when the user asks “how much” — not a guarantee. */
export const CONTAINER_ILLUSTRATIVE_MICRO_USD30 =
  "Illustrative ranges members sometimes see on a ~$30 fix (not a promise; your trader and market month matter): about $6–$9+ over a 1‑month window, about $20–$28+ over 3 months, about $42–$58+ over 6 months — shown as daily slices on the Container screen."
