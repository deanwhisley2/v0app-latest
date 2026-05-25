const FPS_PROBE_KEY = "nexus-low-gpu-fps-fail"
const FPS_PROBE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const FPS_SAMPLE_MS = 700
const FPS_FAIL_THRESHOLD = 24

type FpsProbeRecord = { at: number; fps: number }

/** Prior session measured poor compositor FPS (budget Android). */
export function readLowFpsBenchmarkFlag(): boolean {
  if (typeof sessionStorage === "undefined") return false
  try {
    const raw = sessionStorage.getItem(FPS_PROBE_KEY)
    if (!raw) return false
    const rec = JSON.parse(raw) as FpsProbeRecord
    if (Date.now() - rec.at > FPS_PROBE_MAX_AGE_MS) return false
    return rec.fps > 0 && rec.fps < FPS_FAIL_THRESHOLD
  } catch {
    return false
  }
}

/**
 * One-shot rAF FPS sample — schedules class refresh via callback when done.
 * Safe to call on Android phones; skipped on desktop / non-Android.
 */
export function scheduleLowGpuFpsProbe(onComplete?: () => void): void {
  if (typeof window === "undefined") return
  if (!/android/i.test(navigator.userAgent)) return
  if (readLowFpsBenchmarkFlag()) {
    onComplete?.()
    return
  }
  try {
    if (sessionStorage.getItem(FPS_PROBE_KEY)) {
      onComplete?.()
      return
    }
  } catch {
    return
  }

  let frames = 0
  const start = performance.now()

  function tick(now: number) {
    frames += 1
    if (now - start < FPS_SAMPLE_MS) {
      requestAnimationFrame(tick)
      return
    }
    const elapsed = now - start
    const fps = elapsed > 0 ? (frames * 1000) / elapsed : 60
    try {
      sessionStorage.setItem(
        FPS_PROBE_KEY,
        JSON.stringify({ at: Date.now(), fps: Math.round(fps) } satisfies FpsProbeRecord),
      )
    } catch {
      /* ignore */
    }
    onComplete?.()
  }

  requestAnimationFrame(tick)
}
