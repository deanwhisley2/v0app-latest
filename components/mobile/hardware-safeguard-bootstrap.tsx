"use client"

import { useEffect } from "react"
import { applyLowRamModeClass } from "@/lib/security/hardware-safeguard"

/** Confirms low-RAM class after hydration (navigator APIs may update on WebView). */
export function HardwareSafeguardBootstrap() {
  useEffect(() => {
    applyLowRamModeClass()
  }, [])
  return null
}
