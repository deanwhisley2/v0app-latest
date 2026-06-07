"use client"

import { Suspense } from "react"
import dynamic from "next/dynamic"
import { ClientOnly } from "@/components/mobile/client-only"
import { Loader2 } from "lucide-react"

const RetailRechargePage = dynamic(
  () => import("@/components/dashboard/retail-recharge-page").then((m) => m.RetailRechargePage),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0d1117]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    ),
  },
)

function RechargeFallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0d1117]">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
    </div>
  )
}

export default function RechargePage() {
  return (
    <ClientOnly fallback={<RechargeFallback />}>
      <Suspense fallback={<RechargeFallback />}>
        <RetailRechargePage />
      </Suspense>
    </ClientOnly>
  )
}
