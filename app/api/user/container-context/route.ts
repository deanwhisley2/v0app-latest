import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  CONTAINER_COPY_MIN_STAKE_USD,
  CONTAINER_FIX_BAND2_VALID_REF_PATH_MIN,
  CONTAINER_FIX_BAND2_WINDOW_FUNDING_USD,
  CONTAINER_FIX_MIN_PRINCIPAL_USD,
  CONTAINER_FIX_BAND2_WINDOW_DAYS,
} from "@/lib/container-policy"
import {
  buildUnlockContext,
  listPersonas,
  personaUnlocked,
  type ContainerPersonaRow,
} from "@/lib/server/container-governance"
import { getPlatformLaunchStatus } from "@/lib/server/platform-launch"

function serializePersona(p: ContainerPersonaRow, locked: boolean, lockReason?: string) {
  const strategies = Array.isArray(p.strategies)
    ? (p.strategies as string[])
    : typeof p.strategies === "object" && p.strategies !== null
      ? []
      : []
  return {
    id: p.id,
    kind: p.kind,
    name: p.display_name,
    avatar: p.avatar_initials,
    winRate: p.win_rate_pct ?? 0,
    riskLevel: p.risk_class ?? "Low",
    speciality: p.speciality ?? "",
    description: p.description ?? "",
    strategies,
    monthlyReturn: Number(p.monthly_return_pct ?? 0),
    sortOrder: p.sort_order,
    fixBandRequired: p.fix_band_required,
    legacyIds: p.legacy_ids ?? [],
    locked,
    lockReason: locked ? lockReason : undefined,
  }
}

/**
 * Server-authoritative Container Mode: personas, unlock flags, and policy minimums.
 */
export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth

    const admin = createAdminClient()
    const personas = await listPersonas(admin)
    if (!personas.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Container catalog not deployed — apply migration container_operational_governance on Supabase.",
          copyMinUsd: CONTAINER_COPY_MIN_STAKE_USD,
          fixMinUsd: CONTAINER_FIX_MIN_PRINCIPAL_USD,
          traders: { copy: [], fix: [] },
        },
        { status: 503 },
      )
    }

    const tenureParams = { minPrincipalUsd: 100, minDaysActive: 30 }
    const [ctx, launch] = await Promise.all([
      buildUnlockContext(admin, user.id, tenureParams),
      getPlatformLaunchStatus(),
    ])

    const copyRows = personas.filter((p) => p.kind === "copy")
    const fixRows = personas.filter((p) => p.kind === "fix")

    const copyOut = copyRows.map((p) => {
      const u = personaUnlocked(p, ctx)
      return serializePersona(p, !u.ok, u.reason)
    })

    const fixOut = fixRows.map((p) => {
      const u = personaUnlocked(p, ctx)
      return serializePersona(p, !u.ok, u.reason)
    })

    return NextResponse.json({
      ok: true,
      copyMinUsd: CONTAINER_COPY_MIN_STAKE_USD,
      fixMinUsd: CONTAINER_FIX_MIN_PRINCIPAL_USD,
      fixBandMax: ctx.bandMax,
      fundedFirstTwoWeeksUsd: ctx.funding.fundedInFirstWindowUsd,
      lifetimeFundedUsd: ctx.funding.lifetimeFundedUsd,
      refereeCount: ctx.referrals.refereeCount,
      validReferralCount: ctx.referrals.validReferralCount,
      band2Thresholds: {
        fundingWindowUsd: CONTAINER_FIX_BAND2_WINDOW_FUNDING_USD,
        windowDays: CONTAINER_FIX_BAND2_WINDOW_DAYS,
        validReferralsAlternate: CONTAINER_FIX_BAND2_VALID_REF_PATH_MIN,
      },
      launch: {
        active: launch.active,
        endsAt: launch.endsAt,
        starterFixUnlock: Boolean(launch.programs.onboarding?.starter_fix_unlock),
      },
      traders: {
        copy: copyOut,
        fix: fixOut,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
