import { NextResponse } from "next/server"

/** Legacy pending_requests withdrawal path — retired in favor of withdrawal_requests pipeline. */
const DEPRECATED_BODY = {
  error: "Withdrawal route retired. Submit cashout via the dashboard or POST /api/user/withdrawal/request.",
  code: "WITHDRAWAL_ROUTE_DEPRECATED" as const,
  canonicalPath: "/api/user/withdrawal/request",
  adminPath: "/api/admin/withdrawal-requests",
}

function deprecatedResponse() {
  return NextResponse.json(DEPRECATED_BODY, {
    status: 410,
    headers: { "X-Nexus-Deprecated": "withdrawal-pending-requests-v1" },
  })
}

/** @deprecated Use POST /api/user/withdrawal/request */
export async function POST() {
  return deprecatedResponse()
}

/** @deprecated Use PATCH /api/admin/withdrawal-requests */
export async function PUT() {
  return deprecatedResponse()
}
