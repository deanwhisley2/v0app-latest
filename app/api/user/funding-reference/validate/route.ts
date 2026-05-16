import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  assertFundingPaymentReferenceAvailable,
  DuplicateFundingReferenceError,
  lookupFundingPaymentReference,
} from "@/lib/server/funding-reference-guard"
import { isFundingReferenceFormatValid, normalizeFundingPaymentReference } from "@/lib/server/funding-reference-normalize"

/** Pre-submit reference check for funding forms (authoritative check remains on POST). */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as { reference?: string }
    const reference = typeof body.reference === "string" ? body.reference.trim() : ""
    const normalized = normalizeFundingPaymentReference(reference)
    if (!isFundingReferenceFormatValid(normalized)) {
      return NextResponse.json({ ok: false, code: "INVALID", message: "Transaction reference invalid." })
    }

    const admin = createAdminClient()
    try {
      await assertFundingPaymentReferenceAvailable(admin, {
        rawReference: reference,
        userId: user.id,
      })
    } catch (err) {
      if (err instanceof DuplicateFundingReferenceError) {
        return NextResponse.json({
          ok: false,
          code: err.code,
          message: err.customerMessage,
        })
      }
      throw err
    }

    const lookup = await lookupFundingPaymentReference(admin, reference)
    return NextResponse.json({ ok: true, normalized: lookup.normalized })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Validation failed." },
      { status: 500 },
    )
  }
}
