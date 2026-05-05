import { createClient } from '@supabase/supabase-js'
import { isDevLocalOnly } from '@/lib/dev-local-mode'

// Non-null assertions for real env; fallbacks satisfy `next build` / SSR when vars are temporarily absent (set in .env.local for runtime).
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

const PLACEHOLDER_URL = "placeholder.supabase.co"
const PLACEHOLDER_KEY_PREFIX = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30"

/** Call before auth; returns a user-facing message if env is unusable. */
export function getSupabaseBrowserConfigIssue(): string | null {
  if (isDevLocalOnly()) return null
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ""
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ""
  if (!rawUrl) {
    return "NEXT_PUBLIC_SUPABASE_URL is missing in .env.local (Supabase → Project Settings → API)."
  }
  if (rawUrl.includes(PLACEHOLDER_URL)) {
    return "Replace placeholder NEXT_PUBLIC_SUPABASE_URL in .env.local with your real project URL."
  }
  if (!rawKey) {
    return "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing in .env.local (Supabase → Project Settings → API)."
  }
  if (rawKey.startsWith(PLACEHOLDER_KEY_PREFIX) && rawKey.length < 80) {
    return "Replace placeholder NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local with your project anon key."
  }
  try {
    new URL(rawUrl)
  } catch {
    return "NEXT_PUBLIC_SUPABASE_URL is not a valid URL."
  }
  return null
}
