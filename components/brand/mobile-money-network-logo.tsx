import { cn } from "@/lib/utils"

type Props = {
  network: "MTN" | "Airtel"
  className?: string
  size?: "sm" | "md"
}

/** Brand-styled network marks for security & funding UI (not exchange trademarks). */
export function MobileMoneyNetworkLogo({ network, className, size = "md" }: Props) {
  const dim = size === "sm" ? 36 : 44
  if (network === "MTN") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md shadow-sm",
          className,
        )}
        style={{ width: dim, height: dim }}
        aria-hidden
      >
        <svg viewBox="0 0 64 64" className="h-full w-full" role="img" aria-label="MTN">
          <rect width="64" height="64" rx="8" fill="#FFCC00" />
          <text
            x="32"
            y="40"
            textAnchor="middle"
            fontFamily="Arial Black, Helvetica, sans-serif"
            fontWeight="900"
            fontSize="22"
            fill="#000000"
          >
            MTN
          </text>
        </svg>
      </span>
    )
  }
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm", className)}
      style={{ width: dim, height: dim }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="h-full w-full" role="img" aria-label="Airtel">
        <circle cx="32" cy="32" r="32" fill="#ED1C24" />
        <path
          fill="#FFFFFF"
          d="M18 38c0-9 7.5-16 16.5-16 1.8 0 3.5.3 5 .9-1-5.5-5.5-9.5-11.5-9.5-8 0-14.5 6.5-14.5 15 0 8.5 7 14.5 14.5 14.5 5 0 9.5-2 12-5.5-2.5 2-4.5 3.5-7.5 3.5-6 0-9-3.5-9-4.5z"
        />
        <text
          x="32"
          y="42"
          textAnchor="middle"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="700"
          fontSize="14"
          fill="#FFFFFF"
        >
          airtel
        </text>
      </svg>
    </span>
  )
}
