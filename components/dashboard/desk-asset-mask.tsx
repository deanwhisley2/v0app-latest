"use client"

/**
 * Customer-facing desk cards must not reveal the underlying pair/symbol.
 * Use generic copy only — never render real ticker text in the DOM.
 */

export function DeskPairBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary ${className}`}
    >
      <span
        className="inline-block min-w-[3.5rem] rounded-sm bg-primary/30 blur-[6px] select-none"
        aria-hidden="true"
      >
        ···
      </span>
      <span>Desk lock · active</span>
    </span>
  )
}
