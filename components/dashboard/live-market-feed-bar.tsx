"use client"

type LiveMarketFeedBarProps = {
  status: "loading" | "live" | "error" | "disabled"
  source?: string
  updatedAt?: number
  errorMessage?: string
}

export function LiveMarketFeedBar({
  status,
  source,
  updatedAt,
  errorMessage,
}: LiveMarketFeedBarProps) {
  const time =
    updatedAt && status === "live"
      ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : null

  return (
    <div
      className="border-b border-border bg-muted/40 px-4 py-2 text-xs md:text-sm"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2">
        {status === "loading" && (
          <>
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden />
            <span className="text-muted-foreground">Connecting to market feed…</span>
          </>
        )}
        {status === "live" && (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.7)]" aria-hidden />
            <span className="font-medium text-foreground">Live feed</span>
            {source ? <span className="text-muted-foreground">· {source}</span> : null}
            {time && <span className="text-muted-foreground">· updated {time}</span>}
          </>
        )}
        {status === "error" && (
          <>
            <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden />
            <span className="text-rose-200">Market feed unavailable</span>
            {errorMessage && (
              <span className="truncate text-muted-foreground" title={errorMessage}>
                · {errorMessage}
              </span>
            )}
          </>
        )}
        {status === "disabled" && (
          <>
            <span className="h-2 w-2 rounded-full bg-muted-foreground/60" aria-hidden />
            <span className="text-muted-foreground">
              Live market feed disabled (NEXT_PUBLIC_DEV_LOCAL_ONLY=1). Unset to load real tickers.
            </span>
          </>
        )}
      </div>
    </div>
  )
}
