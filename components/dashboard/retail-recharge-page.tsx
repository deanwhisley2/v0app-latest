"use client"

import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { DashboardPageInner } from "@/components/dashboard/dashboard-page-inner"

/** Dedicated checkout surface at /recharge — full-page payment gateway. */
export function RetailRechargePage() {
  const searchParams = useSearchParams()
  const mode = searchParams.get("mode") === "withdraw" ? "withdraw" : "add"

  return (
    <div className="min-h-[100dvh] bg-[#050608] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-md px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 sm:pt-6">
        <Link
          href="/dashboard"
          prefetch={false}
          className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to dashboard
        </Link>
        <DashboardPageInner fundPageOnly={mode} />
      </div>
    </div>
  )
}
