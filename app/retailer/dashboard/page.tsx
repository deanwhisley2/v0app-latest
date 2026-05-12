import { redirect } from "next/navigation"

/**
 * Legacy URL — designated retailer desks use /dashboard (Wallet → Assets) with the live
 * `retailer_fund_requests` queue, not a static summary page.
 */
export default function RetailerDashboardRedirectPage() {
  redirect("/dashboard")
}
