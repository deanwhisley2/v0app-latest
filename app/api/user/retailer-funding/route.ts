import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getRetailFundingCustomerGate } from "@/lib/server/security-authz"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import {
  assertNoDuplicatePendingUserFunding,
  DuplicatePendingError,
} from "@/lib/server/funding-duplicate-guard"
import {
  assertFundingPaymentReferenceAvailable,
  DuplicateFundingReferenceError,
  isFundingReferenceCooldownActive,
  registerFundingPaymentReference,
} from "@/lib/server/funding-reference-guard"
import {
  attachProfileEmailsToRetailers,
  finalizeRetailerLiquidityReservation,
} from "@/lib/server/retailer-funding-helpers"
import {
  assertRetailDeskQualifiesForCorridor,
  normalizeCorridorNetworkToken,
} from "@/lib/server/retailer-qualification"
import {
  bindFundRequestRotationLine,
  resolveExposedPaymentLine,
} from "@/lib/server/retailer-payment-rotation"
import { notifyUserFundingDecision } from "@/lib/server/approval-inbox-notify"
import { buildFundingSubmittedCustomerCopy } from "@/lib/notifications/customer-notification-language"
import { appendUserAccountNotification } from "@/lib/server/user-account-notifications"
import { customerNotifyForUser } from "@/lib/server/customer-ui-language"
import { getOrCreateSecurityProfile } from "@/lib/server/user-security-profile-service"
import { corridorFiatForCountryIso2, isSupportedFiat } from "@/lib/currency-display"
import { dailyFxQuoteExpiresAt, getDailyLocalPerUsd, localToUsdWithDailyRate } from "@/lib/server/daily-fx-rate"
import { auditFundingConversion, persistFundingAudit } from "@/lib/server/funding-math-audit"
import {
  isAdminDirectFundChannel,
  isKenyaAdminMpesaEligible,
  isUgandaAdminAirtelEligible,
} from "@/lib/server/admin-payment-config"
import { uploadFundingProof } from "@/lib/server/funding-proof-storage"
import {
  inferFundingFxRoutingLane,
  insertFundingFxNormalization,
  insertFundingFxNormalizationUsdOnly,
} from "@/lib/server/funding-fx-middleware"
import { emitTreasuryStreamEvent } from "@/lib/server/treasury-operation-stream"

const CLIENT_USD_TOLERANCE = 0.05

function clientUsdMatchesServerLedger(clientUsd: number, serverUsd: number): boolean {
  return Math.abs(clientUsd - serverUsd) <= CLIENT_USD_TOLERANCE
}

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()
    const gate = await getRetailFundingCustomerGate(user.id, user.email)
    const level = gate.level
    const requestsRes = await admin
      .from("retailer_fund_requests")
      .select(
        "id,retailer_id,official_corridor_route_id,amount,amount_usd_locked,amount_input_local,input_currency,fx_rate_snapshot,fx_locked_at,fx_quote_expires_at,tx_reference,status,note,appeal_note,fund_channel,mobile_network,payment_proof_path,created_at,reviewed_at,resolved_at,escalated_to_admin,payer_display_name,payer_phone,retailer_response_deadline_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
    if (requestsRes.error) return NextResponse.json({ error: requestsRes.error.message }, { status: 500 })

    /** Full desk directory only for designated Level-2 retailer credit sellers; buyers use GET /qualified-retailers. */
    const rawRetailers =
      level === 2 && gate.retailerCreditSeller
        ? (
            await admin
              .from("retailer_profiles")
              .select(
                "id,user_id,payment_numbers,credit_basin,under_review,under_review_reason,country_code,is_country_retailer,liquidity_status,updated_at"
              )
              .order("updated_at", { ascending: false })
          ).data ?? []
        : []
    const retailers = await attachProfileEmailsToRetailers(admin, rawRetailers, {
      redactAdminContacts: true,
    })

    return NextResponse.json({
      userLevel: level,
      customerRetailFunding: gate.canUseRetailFundingCustomerFlow,
      retailers,
      requests: requestsRes.data ?? [],
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const gate = await getRetailFundingCustomerGate(user.id, user.email)
    if (!gate.canUseRetailFundingCustomerFlow) {
      return NextResponse.json(
        { error: "Retailer funding requests are limited to Level 1 and Level 2 accounts that are not designated retailer credit desks." },
        { status: 403 }
      )
    }
    const body = (await request.json().catch(() => ({}))) as {
      retailerId?: string
      officialCorridorRouteId?: string
      amount?: number
      amountInputLocal?: number
      inputCurrency?: string
      txReference?: string
      note?: string
      mobileNetwork?: string
      fundChannel?: "local_mobile" | "legacy_admin" | "admin_crypto" | "admin_airtel_ug" | "admin_mpesa_ke"
      fundingCountryCode?: string
      payerDisplayName?: string
      payerPhone?: string
      payerSource?: "deposit_line" | "withdrawal_line"
      paymentProofPath?: string
      paymentProofDataUrl?: string
      paymentRotationLineId?: string
      paymentRotationPoolId?: string
    }
    const retailerId = typeof body.retailerId === "string" ? body.retailerId.trim() : ""
    const officialCorridorRouteId =
      typeof body.officialCorridorRouteId === "string" ? body.officialCorridorRouteId.trim() : ""
    const txReference = typeof body.txReference === "string" ? body.txReference.trim() : ""
    const clientLedgerUsd = Number(body.amount ?? 0)
    const note = typeof body.note === "string" ? body.note.trim() : null
    const mobileNetwork = typeof body.mobileNetwork === "string" ? body.mobileNetwork.trim().slice(0, 48) : null
    const payerDisplayName =
      typeof body.payerDisplayName === "string" ? body.payerDisplayName.trim().slice(0, 120) || null : null
    const payerPhone = typeof body.payerPhone === "string" ? body.payerPhone.trim().slice(0, 32) || null : null
    const payerSource = body.payerSource === "deposit_line" || body.payerSource === "withdrawal_line" ? body.payerSource : null
    const fundChannelRaw = typeof body.fundChannel === "string" ? body.fundChannel.trim() : "local_mobile"
    const fundChannel = isAdminDirectFundChannel(fundChannelRaw)
      ? fundChannelRaw
      : fundChannelRaw === "legacy_admin"
        ? "legacy_admin"
        : "local_mobile"
    const countryUpdate =
      typeof body.fundingCountryCode === "string" ? body.fundingCountryCode.trim().toUpperCase().slice(0, 2) : ""

    if (!txReference || !Number.isFinite(clientLedgerUsd) || clientLedgerUsd <= 0) {
      return NextResponse.json({ error: "amount and txReference are required." }, { status: 400 })
    }

    if (isAdminDirectFundChannel(fundChannel)) {
      if (retailerId || officialCorridorRouteId) {
        return NextResponse.json(
          { error: "Admin direct payments do not use a retailer desk — submit without retailerId." },
          { status: 400 },
        )
      }
    }

    if (fundChannel === "legacy_admin") {
      if (!retailerId) {
        return NextResponse.json({ error: "retailerId is required for legacy funding." }, { status: 400 })
      }
      if (officialCorridorRouteId) {
        return NextResponse.json({ error: "officialCorridorRouteId is not valid for legacy funding." }, {
          status: 400,
        })
      }
    }
    if (fundChannel === "local_mobile") {
      if (!officialCorridorRouteId && !retailerId) {
        return NextResponse.json(
          { error: "Either retailerId (qualified desk) or officialCorridorRouteId (official corridor) is required." },
          { status: 400 },
        )
      }
      if (officialCorridorRouteId && retailerId) {
        return NextResponse.json(
          { error: "Choose either a retailer desk or the official corridor — not both." },
          { status: 400 },
        )
      }
    }
    const admin = createAdminClient()
    const since24h = new Date(Date.now() - 86_400_000).toISOString()
    const { count: recentDepositsCount, error: depCountErr } = await admin
      .from("retailer_fund_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since24h)
    if (depCountErr) throw new Error(depCountErr.message)
    if ((recentDepositsCount ?? 0) >= 3) {
      return NextResponse.json(
        {
          error:
            "You have reached the limit of 3 deposit requests in 24 hours. Please wait a little and try again.",
          code: "DEPOSIT_LIMIT_24H",
        },
        { status: 429 },
      )
    }

    const resolvePayer = async (): Promise<{ name: string | null; phone: string | null }> => {
      if (payerDisplayName && payerPhone) return { name: payerDisplayName, phone: payerPhone }
      if (!payerSource) return { name: payerDisplayName, phone: payerPhone }
      const sec = await getOrCreateSecurityProfile(admin, user.id)
      if (payerSource === "deposit_line") {
        return { name: sec.deposit_account_names?.trim() || null, phone: sec.deposit_number?.trim() || null }
      }
      return { name: sec.withdrawal_account_names?.trim() || null, phone: sec.withdrawal_number?.trim() || null }
    }

    const payerResolved = fundChannel === "local_mobile" ? await resolvePayer() : { name: payerDisplayName, phone: payerPhone }
    const payerNameFinal = payerResolved.name
    const payerPhoneFinal = payerResolved.phone
    if (fundChannel === "local_mobile" && (!payerNameFinal || !payerPhoneFinal)) {
      return NextResponse.json(
        { error: "payerDisplayName and payerPhone are required for local mobile funding." },
        { status: 400 }
      )
    }

    if (countryUpdate.length === 2) {
      await admin.from("profiles").update({ funding_country_code: countryUpdate }).eq("id", user.id)
    }

    let amountUsdLocked = clientLedgerUsd
    let amountInputLocalNum: number | null = null
    let inputCurrencyStr: string | null = null
    let fxRateSnapshotNum: number | null = null
    let fundingFxRateSourceTag: string | null = null
    let fxQuoteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    let retailerResponseDeadlineAt: string | null = null
    let insertRetailerId: string | null = null
    let insertOfficialRouteId: string | null = null
    let customerFundingCountry = ""

    if (fundChannel === "local_mobile") {
      const { data: prof } = await admin.from("profiles").select("funding_country_code").eq("id", user.id).maybeSingle()
      const userCountry =
        (countryUpdate.length === 2 ? countryUpdate : "") ||
        String(prof?.funding_country_code ?? "")
          .trim()
          .toUpperCase()
      customerFundingCountry = userCountry

      if (userCountry.length !== 2) {
        return NextResponse.json(
          { error: "Save your 2-letter funding country before submitting a local funding request." },
          { status: 400 },
        )
      }

      const cc2 = userCountry.slice(0, 2)
      const corridorFiat = corridorFiatForCountryIso2(cc2)
      const explicitLocal = body.amountInputLocal
      const explicitCur = typeof body.inputCurrency === "string" ? body.inputCurrency.trim().toUpperCase() : ""
      const hasExplicitFx =
        explicitLocal !== undefined &&
        explicitLocal !== null &&
        Number.isFinite(Number(explicitLocal)) &&
        explicitCur.length > 0 &&
        isSupportedFiat(explicitCur)

      if (hasExplicitFx) {
        amountInputLocalNum = Number(explicitLocal)
        inputCurrencyStr = explicitCur
        const daily = await getDailyLocalPerUsd(admin, inputCurrencyStr)
        fxRateSnapshotNum = daily.localPerUsd
        fundingFxRateSourceTag = `internal_daily_fx_rates:${daily.fxTableSource}`
        fxQuoteExpiresAt = dailyFxQuoteExpiresAt(daily.rateDate)
        amountUsdLocked = localToUsdWithDailyRate(amountInputLocalNum, daily.localPerUsd)
      } else if (corridorFiat) {
        inputCurrencyStr = corridorFiat
        const daily = await getDailyLocalPerUsd(admin, corridorFiat)
        fxRateSnapshotNum = daily.localPerUsd
        fundingFxRateSourceTag = `internal_daily_fx_rates:${daily.fxTableSource}`
        fxQuoteExpiresAt = dailyFxQuoteExpiresAt(daily.rateDate)
        const rawLocal = explicitLocal !== undefined && explicitLocal !== null ? Number(explicitLocal) : NaN
        if (Number.isFinite(rawLocal) && rawLocal > 0) {
          amountInputLocalNum = rawLocal
          amountUsdLocked = localToUsdWithDailyRate(rawLocal, daily.localPerUsd)
        }
      }

      const preAudit = auditFundingConversion({
        amountInputLocal: amountInputLocalNum,
        inputCurrency: inputCurrencyStr,
        fxRateSnapshot: fxRateSnapshotNum,
        amountUsdLocked,
      })
      if (!preAudit.ok) {
        return NextResponse.json({ error: preAudit.message, code: preAudit.code }, { status: 400 })
      }

      if (!clientUsdMatchesServerLedger(clientLedgerUsd, amountUsdLocked)) {
        return NextResponse.json(
          {
            error:
              "Ledger USD does not match server FX conversion — refresh the page and re-enter your local funding amount.",
          },
          { status: 400 },
        )
      }

      if (officialCorridorRouteId) {
        const { data: route, error: routeErr } = await admin
          .from("official_corridor_payment_routes")
          .select("id,country_code,network_token,active")
          .eq("id", officialCorridorRouteId)
          .maybeSingle()
        if (routeErr || !route) {
          return NextResponse.json({ error: "Official corridor route not found." }, { status: 400 })
        }
        if (!(route as { active?: boolean }).active) {
          return NextResponse.json({ error: "This official corridor route is not active." }, { status: 400 })
        }
        const rc = String((route as { country_code?: string }).country_code ?? "")
          .trim()
          .toUpperCase()
          .slice(0, 2)
        if (userCountry.length !== 2 || rc !== userCountry) {
          return NextResponse.json({ error: "Country mismatch for official corridor route." }, { status: 400 })
        }
        const rn = normalizeCorridorNetworkToken(String((route as { network_token?: string }).network_token ?? ""))
        const un = normalizeCorridorNetworkToken(mobileNetwork ?? "")
        if (!rn || !un || rn !== un) {
          return NextResponse.json({ error: "Network mismatch for official corridor route." }, { status: 400 })
        }
        insertRetailerId = null
        insertOfficialRouteId = officialCorridorRouteId
      } else if (retailerId) {
        insertOfficialRouteId = null
        insertRetailerId = retailerId
        const qual = await assertRetailDeskQualifiesForCorridor(admin, retailerId, {
          customerCountry: userCountry.slice(0, 2),
          mobileNetwork: mobileNetwork ?? "",
          amountUsd: amountUsdLocked,
        })
        if (!qual.ok) {
          return NextResponse.json({ error: qual.message }, { status: 400 })
        }

        const { data: desk, error: de } = await admin
          .from("retailer_profiles")
          .select("estimated_response_minutes")
          .eq("id", retailerId)
          .maybeSingle()
        if (de || !desk) {
          return NextResponse.json({ error: "Retailer desk not found." }, { status: 400 })
        }
        const minsRaw = Number((desk as { estimated_response_minutes?: number }).estimated_response_minutes ?? 60)
        const mins = Math.min(180, Math.max(1, Number.isFinite(minsRaw) ? minsRaw : 60))
        retailerResponseDeadlineAt = new Date(Date.now() + mins * 60_000).toISOString()
      }
    } else if (fundChannel === "legacy_admin") {
      insertRetailerId = retailerId || null
      insertOfficialRouteId = null
    } else if (fundChannel === "admin_airtel_ug" || fundChannel === "admin_mpesa_ke") {
      insertRetailerId = null
      insertOfficialRouteId = null
      retailerResponseDeadlineAt = null

      if (!payerDisplayName || !payerPhone) {
        return NextResponse.json(
          {
            error:
              fundChannel === "admin_mpesa_ke"
                ? "payerDisplayName and payerPhone are required for Kenya M-PESA funding."
                : "payerDisplayName and payerPhone are required for Uganda Airtel funding.",
          },
          { status: 400 },
        )
      }

      const { data: prof } = await admin.from("profiles").select("funding_country_code").eq("id", user.id).maybeSingle()
      const userCountry =
        (countryUpdate.length === 2 ? countryUpdate : "") ||
        String(prof?.funding_country_code ?? "")
          .trim()
          .toUpperCase()
      const cc2 = userCountry.slice(0, 2)
      if (fundChannel === "admin_airtel_ug" && !isUgandaAdminAirtelEligible(cc2)) {
        return NextResponse.json(
          {
            error: "Uganda Airtel admin funding is only available for Uganda corridor accounts.",
            code: "CORRIDOR_RAIL_MISMATCH",
          },
          { status: 403 },
        )
      }
      if (fundChannel === "admin_mpesa_ke" && !isKenyaAdminMpesaEligible(cc2)) {
        return NextResponse.json(
          {
            error: "Kenya M-PESA till funding is only available for Kenya corridor accounts.",
            code: "CORRIDOR_RAIL_MISMATCH",
          },
          { status: 403 },
        )
      }
      const corridorFiat = corridorFiatForCountryIso2(cc2) ?? (fundChannel === "admin_mpesa_ke" ? "KES" : "UGX")
      const explicitLocal = body.amountInputLocal
      const explicitCur = typeof body.inputCurrency === "string" ? body.inputCurrency.trim().toUpperCase() : ""
      const hasExplicitFx =
        explicitLocal !== undefined &&
        explicitLocal !== null &&
        Number.isFinite(Number(explicitLocal)) &&
        Number(explicitLocal) > 0 &&
        explicitCur.length > 0 &&
        isSupportedFiat(explicitCur)

      if (hasExplicitFx) {
        amountInputLocalNum = Number(explicitLocal)
        inputCurrencyStr = explicitCur
      } else {
        amountInputLocalNum = clientLedgerUsd
        inputCurrencyStr = corridorFiat
      }

      const daily = await getDailyLocalPerUsd(admin, inputCurrencyStr)
      fxRateSnapshotNum = daily.localPerUsd
      fundingFxRateSourceTag = `internal_daily_fx_rates:${daily.fxTableSource}`
      fxQuoteExpiresAt = dailyFxQuoteExpiresAt(daily.rateDate)
      amountUsdLocked = localToUsdWithDailyRate(amountInputLocalNum, daily.localPerUsd)

      const preAudit = auditFundingConversion({
        amountInputLocal: amountInputLocalNum,
        inputCurrency: inputCurrencyStr,
        fxRateSnapshot: fxRateSnapshotNum,
        amountUsdLocked,
      })
      if (!preAudit.ok) {
        return NextResponse.json({ error: preAudit.message, code: preAudit.code }, { status: 400 })
      }

      if (!clientUsdMatchesServerLedger(clientLedgerUsd, amountUsdLocked)) {
        return NextResponse.json(
          {
            error:
              "Ledger USD does not match server FX conversion — refresh the page and re-enter your local funding amount.",
          },
          { status: 400 },
        )
      }
    } else if (isAdminDirectFundChannel(fundChannel)) {
      insertRetailerId = null
      insertOfficialRouteId = null
      retailerResponseDeadlineAt = null
    }

    const adminDirectNetwork =
      fundChannel === "admin_crypto"
        ? "USDT-TRC20"
        : fundChannel === "admin_airtel_ug"
          ? "Airtel"
          : fundChannel === "admin_mpesa_ke"
            ? "MPesa"
            : mobileNetwork

    if (await isFundingReferenceCooldownActive(admin, user.id)) {
      return NextResponse.json(
        { error: "Funding temporarily unavailable.", code: "FUNDING_COOLDOWN" },
        { status: 429 },
      )
    }

    let normalizedPaymentRef: string
    try {
      normalizedPaymentRef = await assertFundingPaymentReferenceAvailable(admin, {
        rawReference: txReference,
        userId: user.id,
      })
    } catch (err) {
      if (err instanceof DuplicateFundingReferenceError) {
        return NextResponse.json(
          { error: err.customerMessage, code: err.code },
          { status: err.httpStatus },
        )
      }
      throw err
    }

    try {
      await assertNoDuplicatePendingUserFunding(
        admin,
        user.id,
        amountUsdLocked,
        fundChannel,
        isAdminDirectFundChannel(fundChannel) ? adminDirectNetwork : mobileNetwork,
      )
    } catch (err) {
      if (err instanceof DuplicatePendingError) {
        return NextResponse.json({ error: err.message, code: "DUPLICATE_PENDING" }, { status: 409 })
      }
      throw err
    }

    const fxLockedAtIso = new Date().toISOString()
    const amountRoundedDisplay = Math.round(amountUsdLocked * 100) / 100

    let paymentProofPath =
      typeof body.paymentProofPath === "string" ? body.paymentProofPath.trim().slice(0, 512) || null : null
    const proofDataUrl = typeof body.paymentProofDataUrl === "string" ? body.paymentProofDataUrl.trim() : ""
    if (proofDataUrl && isAdminDirectFundChannel(fundChannel)) {
      try {
        paymentProofPath = await uploadFundingProof(admin, user.id, proofDataUrl)
      } catch (proofErr) {
        return NextResponse.json(
          { error: proofErr instanceof Error ? proofErr.message : "Payment proof upload failed." },
          { status: 400 },
        )
      }
    }

    let data: Record<string, unknown>
    if (fundChannel === "local_mobile" && insertRetailerId && !insertOfficialRouteId) {
      const { data: rpcData, error: rpcErr } = await admin.rpc("create_retailer_desk_fund_request_with_reserve", {
        p_user_id: user.id,
        p_retailer_profile_id: insertRetailerId,
        p_amount_usd_locked: amountUsdLocked,
        p_amount_input_local: amountInputLocalNum,
        p_input_currency: inputCurrencyStr ?? "",
        p_fx_rate_snapshot: fxRateSnapshotNum,
        p_tx_reference: txReference,
        p_note: note ?? "",
        p_fund_channel: "local_mobile",
        p_mobile_network: mobileNetwork ?? "",
        p_payer_display_name: payerNameFinal ?? "",
        p_payer_phone: payerPhoneFinal ?? "",
        p_retailer_response_deadline_at: retailerResponseDeadlineAt,
        p_escalated_to_admin: false,
        p_fx_quote_expires_at: fxQuoteExpiresAt,
      })
      if (rpcErr) {
        const msg = rpcErr.message ?? ""
        if (msg.includes("INSUFFICIENT_RETAIL_LIQUIDITY_AFTER_RESERVATIONS")) {
          return NextResponse.json(
            {
              error:
                "Retailer liquidity was just reserved by another request — pick another desk or a smaller amount.",
            },
            { status: 409 },
          )
        }
        if (msg.includes("FUNDING_REFERENCE_ALREADY_USED")) {
          return NextResponse.json(
            { error: "Transaction reference already used.", code: "DUPLICATE_FUNDING_REFERENCE" },
            { status: 409 },
          )
        }
        if (msg.includes("FUNDING_REFERENCE_INVALID")) {
          return NextResponse.json(
            { error: "Transaction reference invalid.", code: "DUPLICATE_FUNDING_REFERENCE" },
            { status: 400 },
          )
        }
        return NextResponse.json({ error: rpcErr.message }, { status: 400 })
      }
      const payload = rpcData as { request_id?: string } | null
      const newId = payload?.request_id
      if (!newId) return NextResponse.json({ error: "Fund request creation failed." }, { status: 500 })
      const { data: row, error: fetchErr } = await admin
        .from("retailer_fund_requests")
        .select(
          "id,retailer_id,official_corridor_route_id,amount,amount_usd_locked,amount_input_local,input_currency,fx_rate_snapshot,fx_locked_at,fx_quote_expires_at,tx_reference,status,note,fund_channel,mobile_network,created_at,escalated_to_admin,retailer_response_deadline_at",
        )
        .eq("id", newId)
        .single()
      if (fetchErr || !row) return NextResponse.json({ error: fetchErr?.message ?? "Fetch failed" }, { status: 500 })
      data = row as Record<string, unknown>

      if (insertRetailerId && fundChannel === "local_mobile") {
        const rotLineId =
          typeof body.paymentRotationLineId === "string" ? body.paymentRotationLineId.trim() : ""
        const rotPoolId =
          typeof body.paymentRotationPoolId === "string" ? body.paymentRotationPoolId.trim() : ""
        try {
          if (rotLineId && rotPoolId) {
            await bindFundRequestRotationLine(admin, newId, rotLineId, rotPoolId)
          } else {
            const { data: deskRow } = await admin
              .from("retailer_profiles")
              .select("id,payment_numbers,country_code")
              .eq("id", insertRetailerId)
              .maybeSingle()
            if (deskRow) {
              const resolved = await resolveExposedPaymentLine(admin, {
                retailerProfileId: insertRetailerId,
                countryCode: customerFundingCountry.slice(0, 2),
                mobileNetwork: mobileNetwork ?? "",
                paymentNumbers: deskRow.payment_numbers,
                userId: user.id,
              })
              if (resolved) {
                await bindFundRequestRotationLine(admin, newId, resolved.lineId, resolved.poolId)
              }
            }
          }
        } catch (rotErr) {
          await finalizeRetailerLiquidityReservation(admin, newId, "released", "rotation_bind_failed")
          return NextResponse.json(
            {
              error:
                rotErr instanceof Error
                  ? rotErr.message
                  : "Could not assign payment line for this funding request.",
            },
            { status: 409 },
          )
        }
      }
    } else {
      const { data: ins, error } = await admin
        .from("retailer_fund_requests")
        .insert({
          user_id: user.id,
          retailer_id: insertRetailerId,
          official_corridor_route_id: insertOfficialRouteId,
          amount: amountRoundedDisplay,
          amount_usd_locked: amountUsdLocked,
          amount_input_local: amountInputLocalNum,
          input_currency: inputCurrencyStr,
          fx_rate_snapshot: fxRateSnapshotNum,
          fx_locked_at: fxLockedAtIso,
          fx_quote_expires_at: fxQuoteExpiresAt,
          tx_reference: txReference,
          note,
          status: "pending",
          fund_channel: fundChannel,
          mobile_network: isAdminDirectFundChannel(fundChannel) ? adminDirectNetwork : mobileNetwork,
          payer_display_name: payerNameFinal,
          payer_phone: payerPhoneFinal,
          payment_proof_path: paymentProofPath,
          retailer_response_deadline_at: retailerResponseDeadlineAt,
          escalated_to_admin: Boolean(
            isAdminDirectFundChannel(fundChannel) ||
              (insertOfficialRouteId && fundChannel === "local_mobile"),
          ),
          escalation_at: isAdminDirectFundChannel(fundChannel) ? fxLockedAtIso : null,
          escalated_note: isAdminDirectFundChannel(fundChannel)
            ? "User paid Level-5 admin receive rail; no retailer desk responsible."
            : null,
        })
        .select(
          "id,retailer_id,official_corridor_route_id,amount,amount_usd_locked,amount_input_local,input_currency,fx_rate_snapshot,fx_locked_at,fx_quote_expires_at,tx_reference,status,note,fund_channel,mobile_network,payment_proof_path,created_at,escalated_to_admin,retailer_response_deadline_at",
        )
        .single()
      if (error) {
        if (error.code === "23505") {
          return NextResponse.json(
            { error: "Transaction reference already used.", code: "DUPLICATE_FUNDING_REFERENCE" },
            { status: 409 },
          )
        }
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      data = ins as Record<string, unknown>
      await registerFundingPaymentReference(admin, {
        normalized: normalizedPaymentRef,
        userId: user.id,
        sourceTable: "retailer_fund_requests",
        sourceId: String(data.id),
        statusSnapshot: "pending",
      })
    }

    await persistFundingAudit(admin, {
      fundRequestId: String(data.id ?? ""),
      userId: user.id,
      retailerId: insertRetailerId,
      result: auditFundingConversion({
        amountInputLocal: amountInputLocalNum,
        inputCurrency: inputCurrencyStr,
        fxRateSnapshot: fxRateSnapshotNum,
        amountUsdLocked,
      }),
      metadata: { phase: "create" },
    })

    const reqIdStr = String(data.id ?? "")
    const lane = inferFundingFxRoutingLane({
      fundChannel,
      retailerId: insertRetailerId,
      officialCorridorRouteId: insertOfficialRouteId,
    })
    try {
      if (
        fundChannel === "local_mobile" &&
        amountInputLocalNum != null &&
        amountInputLocalNum > 0 &&
        inputCurrencyStr &&
        fxRateSnapshotNum != null &&
        fxRateSnapshotNum > 0
      ) {
        const rateDate = fxLockedAtIso.slice(0, 10)
        await insertFundingFxNormalization(admin, {
          fundRequestId: reqIdStr,
          userId: user.id,
          routingLane: lane,
          amountInputLocal: amountInputLocalNum,
          inputCurrency: inputCurrencyStr,
          localPerUsd: fxRateSnapshotNum,
          rateDate,
          rateSource: fundingFxRateSourceTag ?? undefined,
          amountUsdNormalized: amountUsdLocked,
          rateCapturedAtIso: fxLockedAtIso,
        })
      } else if (
        fundChannel === "admin_airtel_ug" &&
        amountInputLocalNum != null &&
        amountInputLocalNum > 0 &&
        inputCurrencyStr &&
        fxRateSnapshotNum != null &&
        fxRateSnapshotNum > 0
      ) {
        const rateDate = fxLockedAtIso.slice(0, 10)
        await insertFundingFxNormalization(admin, {
          fundRequestId: reqIdStr,
          userId: user.id,
          routingLane: "admin_direct",
          amountInputLocal: amountInputLocalNum,
          inputCurrency: inputCurrencyStr,
          localPerUsd: fxRateSnapshotNum,
          rateDate,
          rateSource: fundingFxRateSourceTag ?? undefined,
          amountUsdNormalized: amountUsdLocked,
          rateCapturedAtIso: fxLockedAtIso,
        })
      } else if (isAdminDirectFundChannel(fundChannel)) {
        await insertFundingFxNormalizationUsdOnly(admin, {
          fundRequestId: reqIdStr,
          userId: user.id,
          routingLane: "admin_direct",
          amountUsdNormalized: amountUsdLocked,
        })
      } else if (fundChannel === "legacy_admin") {
        await insertFundingFxNormalizationUsdOnly(admin, {
          fundRequestId: reqIdStr,
          userId: user.id,
          routingLane: "legacy_admin",
          amountUsdNormalized: amountUsdLocked,
        })
      }
    } catch (fxErr) {
      console.error("[retailer-funding] FX normalization insert failed:", fxErr)
      const deskReserve =
        fundChannel === "local_mobile" && Boolean(insertRetailerId) && !insertOfficialRouteId
      try {
        if (deskReserve) {
          await finalizeRetailerLiquidityReservation(admin, reqIdStr, "released", "fx_middleware_audit_failed")
        }
      } catch (relErr) {
        console.error("[retailer-funding] rollback reservation failed:", relErr)
      }
      await admin.from("retailer_fund_requests").delete().eq("id", reqIdStr)
      return NextResponse.json(
        {
          error:
            fxErr instanceof Error
              ? fxErr.message
              : "Funding FX audit record could not be created — please try again.",
        },
        { status: 500 },
      )
    }

    await emitTreasuryStreamEvent(admin, {
      eventType: "funding_created",
      fundRequestId: reqIdStr,
      userId: user.id,
      payload: {
        fundChannel,
        amount_usd_locked: amountUsdLocked,
        corridor_route_id: insertOfficialRouteId,
        retailer_id: insertRetailerId,
      },
    })
    await emitTreasuryStreamEvent(admin, {
      eventType: "fx_normalized",
      fundRequestId: reqIdStr,
      userId: user.id,
      payload: {
        routing_lane: lane,
        has_local_quote: !!(
          amountInputLocalNum != null &&
          amountInputLocalNum > 0 &&
          inputCurrencyStr &&
          fxRateSnapshotNum != null
        ),
        rate_source_hint: fundingFxRateSourceTag,
      },
    })

    await recordFinancialEvent({
      userId: user.id,
      eventType: "funding_request_created",
      category: "funding",
      amount: amountUsdLocked,
      balanceSource: "external_funding",
      balanceDestination: "nexus_main_pending",
      status: "pending",
      actorType: "user",
      actorId: user.id,
      transactionRef: txReference,
      summary:
        fundChannel === "admin_crypto"
          ? "Crypto deposit received — processing."
          : fundChannel === "admin_airtel_ug"
            ? "Deposit received — under review."
            : fundChannel === "admin_mpesa_ke"
              ? "M-PESA deposit received — under review."
              : fundChannel === "local_mobile"
                ? insertOfficialRouteId
                  ? "Deposit received — under review."
                  : "Deposit received — under review."
                : "Deposit received — under review.",
      metadata: {
        retailerId: insertRetailerId,
        officialCorridorRouteId: insertOfficialRouteId,
        requestId: data.id,
        fundChannel,
        amountUsdLocked,
        inputCurrency: inputCurrencyStr,
      },
    })
    const { t: notifyT } = await customerNotifyForUser(admin, user.id)
    const submitted = buildFundingSubmittedCustomerCopy(notifyT)
    await appendUserAccountNotification(admin, {
      userId: user.id,
      sourceKind: "funding_status",
      sourceId: `${String(data.id)}:submitted`,
      notificationType: "financial",
      title: submitted.title,
      body: submitted.body,
      nav: { kind: "notifications" },
      metadata: { requestId: data.id, ops_audit: { status: "submitted", fund_channel: fundChannel } },
    })
    await notifyUserFundingDecision(admin, {
      userId: user.id,
      headline: notifyT("notifications.customer.fundingSubmittedTitle"),
      relatedId: data.id as string,
    })
    return NextResponse.json({ ok: true, request: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as { requestId?: string; appealNote?: string }
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
    const appealNote = typeof body.appealNote === "string" ? body.appealNote.trim() : ""
    if (!requestId || !appealNote) {
      return NextResponse.json({ error: "requestId and appealNote are required." }, { status: 400 })
    }
    const admin = createAdminClient()
    const { bridgeFundingAppeal } = await import("@/lib/server/operational-support-bridge")
    const { threadId } = await bridgeFundingAppeal(admin, {
      userId: user.id,
      requestId,
      appealNote,
    })
    await recordFinancialEvent({
      userId: user.id,
      eventType: "funding_request_appealed",
      category: "funding",
      amount: 0,
      status: "pending",
      actorType: "user",
      actorId: user.id,
      relatedTradeId: requestId,
      summary: "Funding appeal escalated for human admin review.",
      metadata: { appealNote, requestId, operationalThreadId: threadId },
    })
    return NextResponse.json({
      ok: true,
      threadId,
      operationalStatus: "pending_admin",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error"
    const status = msg.includes("not found") || msg.includes("cannot be appealed") ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
