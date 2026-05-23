"use client"

import { profileGreetingName, profileTimeGreetingKey } from "@/lib/dashboard-display-name"
import { cn } from "@/lib/utils"

type Props = {
  fullName?: string | null
  t: (key: string) => string
  className?: string
}

/** Institutional profile greeting — concise, no exclamation, first-name only. */
export function DashboardProfileWelcome({ fullName, t, className }: Props) {
  const first = profileGreetingName(fullName)
  const period = profileTimeGreetingKey()
  const greeting = t(`home.profile.greeting.${period}`).replace("{{name}}", first)

  return (
    <header
      className={cn(
        "rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 sm:py-5",
        className
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">
        {t("home.profile.eyebrow")}
      </p>
      <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{greeting}</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{t("home.profile.subtitle")}</p>
    </header>
  )
}
