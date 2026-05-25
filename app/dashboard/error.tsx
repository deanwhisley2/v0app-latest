"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { reportClientDiagnostic } from "@/lib/mobile/mobile-navigation-diagnostics"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientDiagnostic({
      kind: "dashboard_route_error",
      message: error.message.slice(0, 500),
      meta: { digest: error.digest },
    })
  }, [error])

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6">
      <h1 className="text-lg font-semibold text-foreground">Dashboard could not load</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Chrome on this device stopped the page. This is usually fixed by reloading once. Your account data is
        safe.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button type="button" className="w-full touch-manipulation" onClick={() => reset()}>
          Reload dashboard
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full touch-manipulation"
          onClick={() => {
            window.location.href = "/dashboard"
          }}
        >
          Open fresh dashboard
        </Button>
      </div>
    </div>
  )
}
