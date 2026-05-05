/** Merge all `<canvas>` layers inside a chart container into one PNG data URL (for Study Mode freeze). */
export function mergeCanvasesToDataURL(container: HTMLElement, mime: "image/png" | "image/jpeg" = "image/png"): string | null {
  const canvases = [...container.querySelectorAll("canvas")] as HTMLCanvasElement[]
  if (!canvases.length) return null

  const cr = container.getBoundingClientRect()
  const w = Math.max(1, Math.floor(cr.width))
  const h = Math.max(1, Math.floor(cr.height))
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1

  const out = document.createElement("canvas")
  out.width = Math.floor(w * dpr)
  out.height = Math.floor(h * dpr)
  const ctx = out.getContext("2d")
  if (!ctx) return null

  ctx.fillStyle = "#06080b"
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  for (const c of canvases) {
    const r = c.getBoundingClientRect()
    const left = r.left - cr.left
    const top = r.top - cr.top
    try {
      ctx.drawImage(c, left, top, r.width, r.height)
    } catch {
      /* tainted canvas */
    }
  }

  try {
    return out.toDataURL(mime, mime === "image/jpeg" ? 0.92 : undefined)
  } catch {
    return null
  }
}
