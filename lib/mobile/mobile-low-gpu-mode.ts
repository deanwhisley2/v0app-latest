import { readLowFpsBenchmarkFlag } from "@/lib/mobile/low-gpu-fps-probe"

/**
 * Conditional flat compositor mode — Samsung A0x / Mali / Android Go class only.
 * Premium UI remains on higher-end mobile, tablet, and desktop.
 */
export const LOW_GPU_ANDROID_MODE = true

/** @deprecated Use LOW_GPU_ANDROID_MODE */
export const NEXUS_MOBILE_LOW_GPU_MODE = LOW_GPU_ANDROID_MODE

const BUDGET_ANDROID_UA =
  /sm-a0|sm-a1|sm-a2|sm-a3|sm-a4|sm-a5|sm-a05|sm-a055|sm-a135|sm-a145|sm-a155|tecno|itel|infinix|redmi 9a|redmi 10a|galaxy a0|galaxy a1|galaxy a2|galaxy a3|galaxy a4|galaxy a5/i

const ANDROID_GO_UA =
  /android.*\bgo\b|android go|android 8\.1.*go|android 9.*go|android 10.*go|android 11.*(go edition)/i

export function isSamsungGalaxyASeries(userAgent?: string): boolean {
  if (typeof navigator === "undefined" && !userAgent) return false
  const ua = (userAgent ?? navigator.userAgent).toLowerCase()
  return /sm-a\d{2,3}|galaxy a\d{1,2}\b|galaxy a0|galaxy a1/i.test(ua)
}

/** Android WebView — shares Chrome compositor on the same device. */
export function isAndroidWebView(userAgent?: string): boolean {
  if (typeof navigator === "undefined" && !userAgent) return false
  const ua = userAgent ?? navigator.userAgent
  return /android/i.test(ua) && /;\s*wv\)/i.test(ua)
}

export function isAndroidGoDevice(userAgent?: string): boolean {
  const ua = (userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")).toLowerCase()
  return ANDROID_GO_UA.test(ua)
}

function readNavigatorMemory(): number | null {
  if (typeof navigator === "undefined") return null
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof mem === "number" && mem > 0 ? mem : null
}

function readNavigatorCores(): number | null {
  if (typeof navigator === "undefined") return null
  const cores = navigator.hardwareConcurrency
  return typeof cores === "number" && cores > 0 ? cores : null
}

/** WebGL UNMASKED_RENDERER — Mali / PowerVR / legacy Adreno budget SKUs. */
export function isMaliOrBudgetGpuRenderer(): boolean {
  if (typeof document === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    const gl =
      canvas.getContext("webgl") ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null)
    if (!gl) return false
    const ext = gl.getExtension("WEBGL_debug_renderer_info")
    if (!ext) return false
    const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "").toLowerCase()
    return /mali|powervr|adreno \(tm\) 3|adreno 3|adreno 4|videocore|sgx|immortalis-g52/i.test(
      renderer,
    )
  } catch {
    return false
  }
}

function isBudgetAndroidUa(userAgent: string): boolean {
  return BUDGET_ANDROID_UA.test(userAgent) || isSamsungGalaxyASeries(userAgent)
}

/**
 * Runtime detection for LOW_GPU_ANDROID_MODE (no viewport gate).
 * Combines UA, memory, cores, GPU renderer, Android Go, and optional FPS probe.
 */
export function isLowGpuAndroid(userAgent?: string): boolean {
  const ua = (userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")).toLowerCase()
  if (!/android/i.test(ua)) return false

  if (isSamsungGalaxyASeries(ua)) return true
  if (isBudgetAndroidUa(ua)) return true
  if (isAndroidGoDevice(ua)) return true
  if (isAndroidWebView(ua) && isBudgetAndroidUa(ua)) return true

  if (typeof window !== "undefined") {
    if (isMaliOrBudgetGpuRenderer()) return true
    if (readLowFpsBenchmarkFlag()) return true
  }

  const mem = readNavigatorMemory()
  const cores = readNavigatorCores()
  const lowMem = mem !== null && mem <= 4
  const lowCores = cores !== null && cores <= 8

  if (lowMem && lowCores) {
    if (isBudgetAndroidUa(ua) || isSamsungGalaxyASeries(ua)) return true
    if (mem !== null && mem <= 3) return true
    if (cores !== null && cores <= 6) return true
  }

  return false
}

/** @deprecated Use isLowGpuAndroid */
export function isMobileLowGpuCandidate(userAgent?: string): boolean {
  return isLowGpuAndroid(userAgent)
}

/** Active LOW_GPU_ANDROID_MODE on mobile viewport for this session. */
export function isMobileLowGpuMode(): boolean {
  if (!LOW_GPU_ANDROID_MODE) return false
  if (typeof window === "undefined") return false
  if (!window.matchMedia("(max-width: 767px)").matches) return false
  return isLowGpuAndroid()
}

/** Runs in <head> before paint — portaled overlays need the class immediately on A05-class UAs. */
export const MOBILE_LOW_GPU_BOOT_SCRIPT = `
(function(){
  try {
    if (!window.matchMedia || !window.matchMedia("(max-width: 767px)").matches) return;
    var ua = String(navigator.userAgent || "").toLowerCase();
    if (!/android/i.test(ua)) return;
    var mem = navigator.deviceMemory;
    var cores = navigator.hardwareConcurrency;
    var lowMem = typeof mem === "number" && mem > 0 && mem <= 4;
    var lowCores = typeof cores === "number" && cores > 0 && cores <= 8;
    var samsungA = /sm-a\\d{2,3}|galaxy a\\d{1,2}\\b|galaxy a0|galaxy a1/i.test(ua);
    var budget = /sm-a0|sm-a1|sm-a2|sm-a3|sm-a4|sm-a5|sm-a05|sm-a055|tecno|itel|infinix|redmi 9a|galaxy a0|galaxy a1|galaxy a2|galaxy a3|galaxy a4|galaxy a5/i.test(ua);
    var androidGo = /android.*\\bgo\\b|android go/i.test(ua);
    var androidWv = /;\\s*wv\\)/i.test(ua);
    var hit = samsungA || budget || androidGo || (androidWv && (samsungA || budget));
    if (!hit && lowMem && lowCores) {
      hit = budget || samsungA || (mem <= 3) || (cores <= 6);
    }
    if (hit) document.documentElement.classList.add("nexus-mobile-low-gpu");
  } catch(e) {}
})();
`
