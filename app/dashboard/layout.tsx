import type { ReactNode } from "react"

/**
 * Dashboard is authenticated, client-heavy, and ships frequent operational UX fixes.
 * Without this, Next may emit long-lived `s-maxage` cache headers on the HTML shell so
 * phones/browsers keep stale bundles long after a VPS deploy (looks like "production not synced").
 */
export const dynamic = "force-dynamic"
export const revalidate = 0

/** Notifications + bootstrap live under root `app/layout.tsx`. Avoid nesting a second provider here. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children
}
