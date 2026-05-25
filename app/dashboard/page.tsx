"use client"

import dynamic from "next/dynamic"
import { DashboardBootShell } from "@/components/dashboard/dashboard-boot-shell"

/**
 * Dashboard is client-only (ssr: false) to prevent Chrome Android hydration hard-failures.
 * The shell matches server HTML; heavy logic loads after mount in dashboard-page-inner.
 */
const DashboardPageInner = dynamic(
  () =>
    import("@/components/dashboard/dashboard-page-inner").then((m) => ({
      default: m.DashboardPageInner,
    })),
  {
    ssr: false,
    loading: () => <DashboardBootShell />,
  },
)

export default function DashboardPage() {
  return <DashboardPageInner />
}
