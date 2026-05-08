import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { resolveIdentifierToEmail } from "@/lib/server/auth-identifier"
import { findAuthUserIdByEmail } from "@/lib/auth-users"

type Body = {
  identifier?: string
  selfie_hash?: string
}

function hammingDistanceHex(a: string, b: string): number {
  const len = Math.min(a.length, b.length)
  let dist = Math.abs(a.length - b.length) * 4
  for (let i = 0; i < len; i += 1) {
    const x = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16)
    dist += x.toString(2).split("1").length - 1
  }
  return dist
}

export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : ""
  const selfieHash =
    typeof body.selfie_hash === "string" ? body.selfie_hash.trim().toLowerCase() : ""
  if (!identifier || !selfieHash) {
    return NextResponse.json({ error: "identifier and selfie_hash are required" }, { status: 400 })
  }
  if (!/^[0-9a-f]{16,}$/.test(selfieHash)) {
    return NextResponse.json({ error: "Invalid selfie_hash" }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const email = await resolveIdentifierToEmail(admin, identifier)
    if (!email) return NextResponse.json({ error: "Account not found" }, { status: 404 })

    const userId = await findAuthUserIdByEmail(admin, email)
    if (!userId) return NextResponse.json({ error: "Account not found" }, { status: 404 })

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
    if (userError || !userData?.user) {
      return NextResponse.json({ error: userError?.message || "Could not load user" }, { status: 500 })
    }

    const storedHashRaw = userData.user.user_metadata?.selfie_hash
    const storedHash = typeof storedHashRaw === "string" ? storedHashRaw.toLowerCase() : ""
    if (!storedHash) {
      return NextResponse.json(
        { error: "No enrolled selfie found for this account. Use email recovery." },
        { status: 409 }
      )
    }

    const distance = hammingDistanceHex(storedHash, selfieHash)
    const threshold = 14
    if (distance > threshold) {
      return NextResponse.json(
        { error: "Selfie verification failed. Use clear face, no hat/covering." },
        { status: 403 }
      )
    }

    const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "")
    const redirectTo = `${siteBase}/auth/reset-password`
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    })
    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.json(
        { error: linkError?.message || "Could not create recovery session" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      redirectUrl: linkData.properties.action_link,
      message: "Selfie verified. Redirecting to secure password reset...",
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Recovery failed" },
      { status: 500 }
    )
  }
}
