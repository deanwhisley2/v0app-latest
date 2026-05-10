import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import type { User } from "@supabase/supabase-js"
import { getUserFromBearer } from "@/lib/auth-api"

export type AccountGovernance = {
  accountDisabledAt: string | null
  operationalFreezeAt: string | null
}

export async function fetchAccountGovernance(userId: string): Promise<AccountGovernance> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("profiles")
    .select("account_disabled_at, operational_freeze_at")
    .eq("id", userId)
    .maybeSingle()
  const row = data as { account_disabled_at?: string | null; operational_freeze_at?: string | null } | null
  return {
    accountDisabledAt: row?.account_disabled_at ?? null,
    operationalFreezeAt: row?.operational_freeze_at ?? null,
  }
}

export function governanceReadBlockResponse(g: AccountGovernance): NextResponse | null {
  if (g.accountDisabledAt) {
    return NextResponse.json(
      {
        error: "This account has been disabled. Contact support.",
        code: "ACCOUNT_DISABLED",
      },
      { status: 403 },
    )
  }
  return null
}

export function governanceMutateBlockResponse(g: AccountGovernance): NextResponse | null {
  const r = governanceReadBlockResponse(g)
  if (r) return r
  if (g.operationalFreezeAt) {
    return NextResponse.json(
      {
        error:
          "Account is temporarily frozen: trading, transfers, withdrawals, and settings changes are blocked until compliance review completes.",
        code: "ACCOUNT_FROZEN",
      },
      { status: 403 },
    )
  }
  return null
}

/**
 * Use in API routes after resolving the user. `read` blocks disabled; `mutate` also blocks frozen.
 */
export async function enforceGovernanceOrResponse(
  userId: string,
  level: "read" | "mutate",
): Promise<NextResponse | null> {
  const g = await fetchAccountGovernance(userId)
  return level === "mutate" ? governanceMutateBlockResponse(g) : governanceReadBlockResponse(g)
}

/** Standard guard: Bearer user + governance for all /api/user consumers. */
export async function bearerUserWithGovernance(
  request: Request,
  level: "read" | "mutate",
): Promise<{ user: User } | { response: NextResponse }> {
  const user = await getUserFromBearer(request)
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }) }
  }
  const blocked = await enforceGovernanceOrResponse(user.id, level)
  if (blocked) return { response: blocked }
  return { user }
}
