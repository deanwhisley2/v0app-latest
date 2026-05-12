import { redirect } from "next/navigation"

/**
 * Legacy URL — Level-5 operational command center lives on /dashboard (Wallet → Assets).
 * Preserves bookmarks and external links to this path.
 */
export default function AdminTreasuryRedirectPage() {
  redirect("/dashboard")
}
