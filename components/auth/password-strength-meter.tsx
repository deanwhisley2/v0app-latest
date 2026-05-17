"use client"

import { getAuthMessages } from "@/lib/i18n/auth-messages"
import type { AppLanguage } from "@/lib/user-preferences"
import { cn } from "@/lib/utils"

function score(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0
  let s = 0
  if (password.length >= 6) s++
  if (password.length >= 10) s++
  if (/[A-Z]/.test(password) && /[0-9]/.test(password)) s++
  return Math.min(3, s) as 0 | 1 | 2 | 3
}

type Props = {
  password: string
  language?: AppLanguage
}

export function PasswordStrengthMeter({ password, language = "en" }: Props) {
  const t = getAuthMessages(language)
  const s = score(password)
  if (!password) return null

  const label =
    s <= 1 ? t.register.passwordWeak : s === 2 ? t.register.passwordFair : t.register.passwordStrong

  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              s >= i ? (s === 3 ? "bg-emerald-500" : s === 2 ? "bg-amber-500" : "bg-rose-500") : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t.register.passwordStrength}: <span className="text-foreground">{label}</span>
      </p>
    </div>
  )
}
