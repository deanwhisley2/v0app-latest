import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { mergeSafeUserMetadata } from "@/lib/server/auth-jwt-metadata"
import { comprefaceEnrollFace, isCompreFaceConfigured } from "@/lib/server/compreface"

/** Never return multi‑MB data URLs in JSON — breaks clients and duplicates JWT bloat risk. */
function clientSafeAvatarRef(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null
  const t = raw.trim()
  if (t.startsWith("http://") || t.startsWith("https://")) return t
  return null
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rawAvatar = data?.avatar_url ?? null
    return NextResponse.json({
      ok: true,
      hasSelfie: Boolean(rawAvatar),
      avatarUrl: clientSafeAvatarRef(rawAvatar),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const avatarUrl = typeof body.avatar_url === "string" ? body.avatar_url.trim() : ""
    const selfieHash =
      typeof body.selfie_hash === "string" ? body.selfie_hash.trim().toLowerCase() : ""
    if (!avatarUrl) {
      return NextResponse.json({ error: "avatar_url is required" }, { status: 400 })
    }
    if (!selfieHash || !/^[0-9a-f]{16,}$/.test(selfieHash)) {
      return NextResponse.json({ error: "selfie_hash is required" }, { status: 400 })
    }
    if (avatarUrl.length > 6_000_000) {
      return NextResponse.json({ error: "Selfie payload too large" }, { status: 413 })
    }

    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        avatar_url: avatarUrl,
        updated_at: nowIso,
      })
      .eq("id", user.id)
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

    const currentMeta = (user.user_metadata ?? {}) as Record<string, unknown>
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: mergeSafeUserMetadata(currentMeta, {
        selfie_hash: selfieHash,
        selfie_enrolled_at: nowIso,
        security_selfie_enrolled: true,
      }),
    })
    if (metaError) return NextResponse.json({ error: metaError.message }, { status: 500 })

    if (isCompreFaceConfigured()) {
      try {
        await comprefaceEnrollFace(user.id, avatarUrl)
      } catch (e) {
        console.warn("[security-selfie] CompreFace enroll warning:", e instanceof Error ? e.message : String(e))
      }
    }

    return NextResponse.json({
      ok: true,
      faceAdded: true,
      message: "Face added. Selfie fingerprint encoded for secure comparison.",
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
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

export async function PUT(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const selfieHash =
      typeof body.selfie_hash === "string" ? body.selfie_hash.trim().toLowerCase() : ""
    if (!selfieHash || !/^[0-9a-f]{16,}$/.test(selfieHash)) {
      return NextResponse.json({ error: "selfie_hash is required" }, { status: 400 })
    }

    const storedHash =
      typeof user.user_metadata?.selfie_hash === "string"
        ? String(user.user_metadata.selfie_hash).toLowerCase()
        : ""
    if (!storedHash) {
      return NextResponse.json({ error: "No enrolled selfie to compare against." }, { status: 409 })
    }

    const distance = hammingDistanceHex(storedHash, selfieHash)
    const matched = distance <= 14
    return NextResponse.json({ ok: true, matched, distance, threshold: 14 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
