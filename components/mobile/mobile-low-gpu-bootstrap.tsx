"use client"

import { useEffect } from "react"
import { scheduleLowGpuFpsProbe } from "@/lib/mobile/low-gpu-fps-probe"
import { isMobileLowGpuMode, isLowGpuAndroid } from "@/lib/mobile/mobile-low-gpu-mode"

/** Marks document for flat GPU/compositor CSS — budget Android only. */
export function MobileLowGpuBootstrap() {
  useEffect(() => {
    const html = document.documentElement

    const apply = () => {
      if (isMobileLowGpuMode()) {
        html.classList.add("nexus-mobile-low-gpu")
      } else {
        html.classList.remove("nexus-mobile-low-gpu")
      }
    }

    apply()

    if (/android/i.test(navigator.userAgent) && !isLowGpuAndroid()) {
      scheduleLowGpuFpsProbe(apply)
    }

    window.addEventListener("resize", apply)
    return () => {
      window.removeEventListener("resize", apply)
      html.classList.remove("nexus-mobile-low-gpu")
    }
  }, [])

  return null
}
