"use client"

import { useEffect } from "react"
import { isMobileLowGpuMode } from "@/lib/mobile/mobile-low-gpu-mode"

/** Marks document for flat GPU/compositor CSS — A05-class devices only. */
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
    window.addEventListener("resize", apply)
    return () => {
      window.removeEventListener("resize", apply)
      html.classList.remove("nexus-mobile-low-gpu")
    }
  }, [])

  return null
}
