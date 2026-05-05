import type { User } from "@supabase/supabase-js"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { TRADING_USER_LEVEL } from "@/lib/trading-user-level"

/**
 * No-credentials / guest access: off by default for production realism.
 * Set `NEXT_PUBLIC_ENABLE_GUEST=1` to allow guest mode.
 * `NEXT_PUBLIC_DEV_LOCAL_ONLY=1` still allows guest for local development.
 */
export function isGuestLoginEnabled(): boolean {
  if (isDevLocalOnly()) return true
  return process.env.NEXT_PUBLIC_ENABLE_GUEST === "1"
}

/** @alias — same as {@link isGuestLoginEnabled} */
export function isFreeEntryEnabled(): boolean {
  return isGuestLoginEnabled()
}

/** Stable synthetic user for UI-only exploration; not in auth.users. */
export function createGuestUser(): User {
  const now = new Date().toISOString()
  return {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "guest@nexuspro.local",
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: {},
    user_metadata: {
      full_name: "Guest",
      username: "guest",
      level: TRADING_USER_LEVEL,
    },
    identities: [],
    factors: undefined,
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  } as User
}
