import type { ReactNode } from "react"

/** Notifications + bootstrap live under root `app/layout.tsx`. Avoid nesting a second provider here. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children
}
