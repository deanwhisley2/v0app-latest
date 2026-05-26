"use client"

import dynamic from "next/dynamic"
import { DashboardBootShell } from "@/components/dashboard/dashboard-boot-shell"
import { ClientOnly } from "@/components/mobile/client-only"

/**
 * Dashboard is client-only (ssr: false) to prevent Chrome Android hydration hard-failures.
 * ClientOnly ensures the first client paint matches the server shell before heavy logic mounts.
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
  return (
    <ClientOnly fallback={<DashboardBootShell />} chromeAndroidDelayMs={48}>
      <DashboardPageInner />
    </ClientOnly>
  )
}
