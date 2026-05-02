import { createClient } from '@supabase/supabase-js'

// Non-null assertions for real env; fallbacks satisfy `next build` / SSR when vars are temporarily absent (set in .env.local for runtime).
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
