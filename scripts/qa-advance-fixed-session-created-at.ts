#!/usr/bin/env npx tsx
/**
 * QA-only: shift fixed_trade_sessions.created_at backward to simulate calendar advance
 * (e.g. test 5-day earnings release windows). Requires service role env + explicit guard.
 *
 * Usage:
 *   ALLOW_QA_SESSION_TIME_MUTATION=1 npx tsx scripts/qa-advance-fixed-session-created-at.ts --session=<uuid> --days=6
 *
 * Does not run unless ALLOW_QA_SESSION_TIME_MUTATION=1.
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`))
  if (hit) return hit.slice(name.length + 1).trim()
  const idx = process.argv.indexOf(name)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1].trim()
  return undefined
}

async function main() {
  if (process.env.ALLOW_QA_SESSION_TIME_MUTATION !== "1") {
    throw new Error("Refusing to run: set ALLOW_QA_SESSION_TIME_MUTATION=1 for this QA tool.")
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url?.trim() || !key?.trim()) {
    throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.")
  }
  const sessionId = arg("--session")
  const daysRaw = arg("--days")
  if (!sessionId) throw new Error("Missing --session=<fixed_trade_sessions.id>")
  const days = Number(daysRaw ?? "0")
  if (!Number.isFinite(days) || days <= 0 || days > 120) {
    throw new Error("Invalid --days (use a small positive integer, max 120).")
  }

  const sb = createClient(url, key)
  const { data: row, error: fErr } = await sb
    .from("fixed_trade_sessions")
    .select("id,user_id,created_at,status")
    .eq("id", sessionId)
    .maybeSingle()
  if (fErr) throw new Error(fErr.message)
  if (!row) throw new Error("Session not found.")

  const prev = new Date(String(row.created_at))
  const next = new Date(prev.getTime() - days * 86_400_000)

  const { error: uErr } = await sb
    .from("fixed_trade_sessions")
    .update({ created_at: next.toISOString() })
    .eq("id", sessionId)
  if (uErr) throw new Error(uErr.message)

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionId,
        previousCreatedAt: prev.toISOString(),
        newCreatedAt: next.toISOString(),
        shiftedDays: days,
      },
      null,
      2,
    ),
  )
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
