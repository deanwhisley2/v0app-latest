"use client"

import type { MouseEvent, TouchEvent } from "react"
import { reportClientDiagnostic } from "@/lib/mobile/mobile-navigation-diagnostics"

const DEFAULT_DEBOUNCE_MS = 420
const CLICK_AFTER_TOUCH_MS = 520

const lastFireAt = new Map<string, number>()
const touchConsumedUntil = new Map<string, number>()

function tapTargetMeta(el: EventTarget | null): Record<string, unknown> {
  if (!(el instanceof Element)) return {}
  const tag = el.tagName
  const id = el.id || undefined
  const role = el.getAttribute("role") || undefined
  const testId = el.getAttribute("data-testid") || undefined
  const label =
    (el as HTMLElement).ariaLabel ||
    (el as HTMLElement).innerText?.slice(0, 48) ||
    undefined
  return { tag, id, role, testId, label }
}

/** Log deliberate taps when diagnostics are on (always reports to server in dev builds). */
export function logIntentionalTap(
  surface: string,
  e: MouseEvent | TouchEvent,
  meta?: Record<string, unknown>,
): void {
  const touch =
    "touches" in e && e.touches.length > 0
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : "changedTouches" in e && e.changedTouches.length > 0
        ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
        : null
  reportClientDiagnostic({
    kind: "touch_tap",
    message: surface,
    meta: {
      ...tapTargetMeta(e.target),
      touch,
      ...meta,
    },
  })
}

/**
 * Debounced handler for nav chrome — suppresses duplicate touch+click and rapid re-taps.
 */
export function createIntentionalTapHandler(
  surface: string,
  handler: () => void,
  opts?: { debounceMs?: number },
): {
  onTouchEnd: (e: TouchEvent) => void
  onClick: (e: MouseEvent) => void
} {
  const debounceMs = opts?.debounceMs ?? DEFAULT_DEBOUNCE_MS

  const run = (e: MouseEvent | TouchEvent) => {
    const now = Date.now()
    const last = lastFireAt.get(surface) ?? 0
    if (now - last < debounceMs) {
      reportClientDiagnostic({
        kind: "tap_suppressed",
        message: surface,
        meta: { reason: "debounce", deltaMs: now - last },
      })
      e.preventDefault()
      e.stopPropagation()
      return
    }
    lastFireAt.set(surface, now)
    logIntentionalTap(surface, e)
    handler()
  }

  return {
    onTouchEnd: (e) => {
      e.preventDefault()
      touchConsumedUntil.set(surface, Date.now() + CLICK_AFTER_TOUCH_MS)
      run(e)
    },
    onClick: (e) => {
      const until = touchConsumedUntil.get(surface) ?? 0
      if (Date.now() < until) {
        e.preventDefault()
        e.stopPropagation()
        reportClientDiagnostic({
          kind: "tap_suppressed",
          message: surface,
          meta: { reason: "click_after_touch" },
        })
        return
      }
      run(e)
    },
  }
}
