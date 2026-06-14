import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { getOrCreateSecurityProfile, verifyUserSecurityCode } from "@/lib/server/user-security-profile-service"
import { isSupportedFiat } from "@/lib/currency-display"

const SUPPORTED_AIRTIME_CURRENCIES = ["KES", "UGX"] as const
const MIN_AIRTIME_USD = 0.5 // ~2000 KES worth

type AirtimeBody = {
  amountLocal: number
  localCurrency: "KES" | "UGX"
  network: string
  phoneNumber: string
  accountNames?: string
  securityCode?: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Get approximate USD rate for local currency
 */
function localToUsd(amountLocal: number, currency: string): number {
  // Approximate rates (will be refined with live FX)
  switch (currency) {
    case "KES": return round2(amountLocal / 130) // ~130 KES = 1 USD
    case "UGX": return round2(amountLocal / 3700) // ~3700 UGX = 1 USD
    default: return amountLocal
  }
}

/**
 * POST /api/user/airtime — Request airtime from earnings
 */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as AirtimeBody

    const amountLocal = Number(body.amountLocal ?? 0)
    const localCurrency = (body.localCurrency ?? "").toUpperCase() as "KES" | "UGX"
    const network = (body.network ?? "").trim()
    const phoneNumber = (body.phoneNumber ?? "").trim()
    const accountNames = (body.accountNames ?? "").trim() || null
    const securityCode = (body.securityCode ?? "").trim()

    // Validation
    if (!Number.isFinite(amountLocal) || amountLocal <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 })
    }

    if (!SUPPORTED_AIRTIME_CURRENCIES.includes(localCurrency)) {
      return NextResponse.json({ error: `Unsupported currency. Supported: ${SUPPORTED_AIRTIME_CURRENCIES.join(", ")}` }, { status: 400 })
    }

    if (!network) {
      return NextResponse.json({ error: "Network is required (e.g., Safaricom, Airtel, MTN)" }, { status: 400 })
    }

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 })
    }

    // Validate phone format (basic)
    const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, "")
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 })
    }

    if (!securityCode) {
      return NextResponse.json({ error: "Enter your 6-digit Security PIN" }, { status: 400 })
    }

    // Verify security PIN
    const admin = createAdminClient()
    const secRow = await getOrCreateSecurityProfile(admin, user.id)
    if (!secRow.security_code_hash) {
      return NextResponse.json({ error: "Set your Nexus Security Code in Settings first" }, { status: 403 })
    }
    const pinOk = await verifyUserSecurityCode(admin, user.id, securityCode)
    if (!pinOk) {
      return NextResponse.json({ error: "Security PIN is incorrect" }, { status: 403 })
    }

    // Convert to USD
    const amountUsd = localToUsd(amountLocal, localCurrency)

    // Check minimum
    if (amountUsd < MIN_AIRTIME_USD) {
      return NextResponse.json({
        error: `Minimum airtime amount is ${MIN_AIRTIME_USD} USD worth (approx ${localCurrency === "KES" ? "2,000 KES" : "74,000 UGX"})`
      }, { status: 400 })
    }

    // Check balance
    const { data: bal } = await admin
      .from("user_balances")
      .select("container_withdrawable_earnings")
      .eq("user_id", user.id)
      .maybeSingle()

    const earningsAvailable = Number(bal?.container_withdrawable_earnings ?? 0)
    if (amountUsd > earningsAvailable + 0.01) {
      return NextResponse.json({
        error: "Insufficient earnings balance for this airtime request",
        availableUsd: earningsAvailable
      }, { status: 400 })
    }

    const txRef = crypto.randomUUID()

    // Call the RPC
    const { data: result, error: rpcErr } = await admin.rpc("request_airtime_v1", {
      p_user_id: user.id,
      p_amount_usd: amountUsd,
      p_amount_local: amountLocal,
      p_local_currency: localCurrency,
      p_network: network,
      p_phone_number: cleanPhone,
      p_account_names: accountNames,
      p_security_code_hash: secRow.security_code_hash,
    })

    if (rpcErr) throw new Error(rpcErr.message)

    const parsed = result as Record<string, unknown>
    if (!parsed?.ok) {
      return NextResponse.json({ error: String(parsed?.error ?? "Request failed") }, { status: 400 })
    }

    // Record financial event
    await recordFinancialEvent({
      userId: user.id,
      eventType: "airtime_request",
      category: "cashout",
      amount: amountUsd,
      feeAmount: 0,
      balanceSource: "container_withdrawable_earnings",
      balanceDestination: "airtime_withdrawable_earnings",
      status: "pending",
      transactionRef: String(parsed.transaction_ref ?? txRef),
      actorType: "user",
      actorId: user.id,
      summary: `Airtime request: ${amountLocal} ${localCurrency} on ${network} (${cleanPhone})`,
      metadata: {
        requestId: parsed.request_id,
        localAmount: amountLocal,
        localCurrency,
        network,
        phoneNumber: cleanPhone,
        amountUsd,
      },
    })

    return NextResponse.json({
      ok: true,
      requestId: parsed.request_id,
      transactionRef: parsed.transaction_ref,
      amountUsd,
      amountLocal,
      localCurrency,
      status: "pending",
      message: `Your airtime request for ${amountLocal} ${localCurrency} is pending admin approval.`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/user/airtime — List user's airtime requests
 */
export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("airtime_requests")
      .select("id,amount_usd,amount_local,local_currency,network,phone_number,status,transaction_ref,created_at,reviewed_at,metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)
    return NextResponse.json({ requests: data ?? [] })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
