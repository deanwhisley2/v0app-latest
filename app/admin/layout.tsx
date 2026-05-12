import type { ReactNode } from "react"

/** Match dashboard: admin surfaces change often; avoid long-lived HTML/RSC caching at the edge. */
export const dynamic = "force-dynamic"
export const revalidate = 0

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children
}
