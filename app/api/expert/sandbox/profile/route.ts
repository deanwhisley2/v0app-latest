import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { createSandboxGovernanceProfile, listSandboxProfiles } from "@/lib/sandbox-execution-engine"

export async function GET(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const { searchParams } = new URL(request.url)
    const limit = Number(searchParams.get("limit") ?? 50)
    const profiles = await listSandboxProfiles(userOrRes, limit)
    return NextResponse.json({ profiles })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}

export async function POST(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await request.json()) as { label?: string; governanceOverrides?: Record<string, number>; notes?: string }
    if (!body.label?.trim() || !body.governanceOverrides || typeof body.governanceOverrides !== "object") {
      return NextResponse.json(
        { code: ERROR_CODES.INVALID_REQUEST, error: "label and governanceOverrides are required" },
        { status: 400 }
      )
    }
    const created = await createSandboxGovernanceProfile({
      userId: userOrRes,
      label: body.label,
      governanceOverrides: body.governanceOverrides,
      notes: body.notes,
    })
    return NextResponse.json(created)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
