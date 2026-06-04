/**
 * Customer-facing payment *instruction* labels only.
 * Legal / treasury / retailer registry identity in DB and admin config stays unchanged.
 */

/** Name customers should use when paying via Airtel menu (instruction copy). */
export const CUSTOMER_AIRTEL_MENU_DISPLAY_NAME = "Nexus Pro2"

/** Map instruction-surface payee text (must already be network-scoped from payment route resolution). */
export function customerInstructionPayeeDisplay(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim()
  if (!trimmed) return CUSTOMER_AIRTEL_MENU_DISPLAY_NAME
  return trimmed
}

/** Instruction panels: always show canonical Airtel menu merchant label. */
export function customerInstructionAirtelMerchantName(fallback?: string | null): string {
  const fb = String(fallback ?? "").trim()
  if (fb && !/pegasus/i.test(fb)) return fb
  return CUSTOMER_AIRTEL_MENU_DISPLAY_NAME
}
