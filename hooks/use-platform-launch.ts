"use client"

import { useEffect, useState } from "react"
import type { PlatformLaunchPublicStatus } from "@/lib/platform-launch-config"

export function usePlatformLaunch() {
  const [launch, setLaunch] = useState<PlatformLaunchPublicStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/platform-launch/status", { cache: "no-store" })
        const data = (await res.json()) as { ok?: boolean; launch?: PlatformLaunchPublicStatus }
        if (!cancelled && res.ok && data.launch) setLaunch(data.launch)
      } catch {
        /* non-blocking */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const t = setInterval(load, 120_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  return { launch, loading, active: Boolean(launch?.active) }
}
