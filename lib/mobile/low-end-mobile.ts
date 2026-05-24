/** Heuristics for budget Android devices (A0x, Tecno, Itel, Infinix). */
export function isLowEndMobileDevice(): boolean {
  if (typeof window === "undefined") return false
  const coarse = window.matchMedia("(pointer: coarse)").matches
  const narrow = window.matchMedia("(max-width: 767px)").matches
  if (!coarse || !narrow) return false

  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (typeof mem === "number" && mem > 0 && mem <= 4) return true

  const cores = navigator.hardwareConcurrency
  if (typeof cores === "number" && cores > 0 && cores <= 4) return true

  const ua = navigator.userAgent.toLowerCase()
  if (/sm-a0|sm-a1|sm-a2|sm-a3|tecno|itel|infinix|redmi 9a|galaxy a0/i.test(ua)) return true

  return false
}
