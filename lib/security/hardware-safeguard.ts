/**
 * Low-RAM hardware profile shield — complements LOW_GPU_ANDROID_MODE.
 * Applies `html.nexus-low-ram-mode` before paint on budget devices (≤2GB RAM or ≤4 CPU cores).
 */

export const NEXUS_LOW_RAM_MODE_CLASS = "nexus-low-ram-mode"

export const LOW_RAM_MEMORY_GB_THRESHOLD = 2
export const LOW_RAM_CPU_CORES_THRESHOLD = 4

export type HardwareProfile = {
  deviceMemoryGb: number | null
  hardwareConcurrency: number | null
  lowRamMode: boolean
}

export function readDeviceMemoryGb(): number | null {
  if (typeof navigator === "undefined") return null
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof mem === "number" && mem > 0 ? mem : null
}

export function readHardwareConcurrency(): number | null {
  if (typeof navigator === "undefined") return null
  const cores = navigator.hardwareConcurrency
  return typeof cores === "number" && cores > 0 ? cores : null
}

/** True when RAM ≤ 2GB OR CPU cores ≤ 4 (user policy for 1–2GB budget phones). */
export function isLowRamHardwareProfile(
  deviceMemoryGb?: number | null,
  hardwareConcurrency?: number | null,
): boolean {
  const mem = deviceMemoryGb ?? readDeviceMemoryGb()
  const cores = hardwareConcurrency ?? readHardwareConcurrency()
  const lowMem = mem !== null && mem <= LOW_RAM_MEMORY_GB_THRESHOLD
  const lowCores = cores !== null && cores <= LOW_RAM_CPU_CORES_THRESHOLD
  return lowMem || lowCores
}

export function detectHardwareProfile(): HardwareProfile {
  const deviceMemoryGb = readDeviceMemoryGb()
  const hardwareConcurrency = readHardwareConcurrency()
  return {
    deviceMemoryGb,
    hardwareConcurrency,
    lowRamMode: isLowRamHardwareProfile(deviceMemoryGb, hardwareConcurrency),
  }
}

export function applyLowRamModeClass(root: HTMLElement = document.documentElement): boolean {
  const active = isLowRamHardwareProfile()
  if (active) root.classList.add(NEXUS_LOW_RAM_MODE_CLASS)
  else root.classList.remove(NEXUS_LOW_RAM_MODE_CLASS)
  return active
}

/** Runs in <head> before paint — avoids GPU flicker on first frame. */
export const HARDWARE_SAFEGUARD_BOOT_SCRIPT = `
(function(){
  try {
    var mem = navigator.deviceMemory;
    var cores = navigator.hardwareConcurrency;
    var lowMem = typeof mem === "number" && mem > 0 && mem <= ${LOW_RAM_MEMORY_GB_THRESHOLD};
    var lowCores = typeof cores === "number" && cores > 0 && cores <= ${LOW_RAM_CPU_CORES_THRESHOLD};
    if (lowMem || lowCores) {
      document.documentElement.classList.add("${NEXUS_LOW_RAM_MODE_CLASS}");
    }
  } catch(e) {}
})();
`.trim()
