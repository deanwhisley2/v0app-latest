"use client"

import type { ReactNode } from "react"
import { NexusNotificationsProvider } from "@/contexts/NexusNotificationsContext"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <NexusNotificationsProvider>{children}</NexusNotificationsProvider>
}
