"use client"

import { profileGreetingName, profileTimeGreetingKey } from "@/lib/dashboard-display-name"
import { cn } from "@/lib/utils"
import { NX_PANEL, NX_PANEL_PAD } from "@/lib/nexus-ui-surfaces"

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
    <header className={cn(NX_PANEL, NX_PANEL_PAD, className)}>
      <p className="text-xs font-medium text-muted-foreground">
        {t("home.profile.eyebrow")}
      </p>
      <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{greeting}</h1>
      <p className="mt-1 max-w-lg text-xs leading-snug text-muted-foreground line-clamp-2 sm:text-sm">
        {t("home.profile.subtitle")}
      </p>
    </header>
  )
}
