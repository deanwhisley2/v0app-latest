import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  PublicSecurityProfile,
  RegisteredPayoutOption,
  SecurityProfileSetupFields,
} from "@/lib/nexus-security-profile-types"
import {
  fingerprintValue,
  hashSecurityCode,
  isValidSecurityCodeFormat,
  maskSensitiveValue,
  verifySecurityCode,
} from "@/lib/nexus-security-code"
import {
  hasMinimumPayoutLine,
  hasMinimumSecurity,
  suggestsOptionalSecurityEnhancements,
} from "@/lib/nexus-security-minimum"
import {
  lineReady,
  resolveLineFromPayoutId,
  syncLegacyMirrorColumns,
  type PayoutLineId,
} from "@/lib/nexus-mobile-money-lines"
import {
  CRYPTO_WITHDRAWAL_NOTICE,
  isValidTrc20UsdtAddress,
  normalizeDepositNumber,
  normalizeWithdrawalNumber,
  SENSITIVE_CHANGE_COOLDOWN_DAYS,
  type NexusPayoutMethod,
} from "@/lib/nexus-payout-methods"

export type UserSecurityProfileRow = {
  user_id: string
  security_code_hash: string | null
  security_code_set_at: string | null
  deposit_number: string | null
  withdrawal_number: string | null
  deposit_account_names: string | null
  withdrawal_account_names: string | null
  mtn_deposit_number: string | null
  mtn_deposit_account_names: string | null
  airtel_deposit_number: string | null
  airtel_deposit_account_names: string | null
  mtn_withdrawal_number: string | null
  mtn_withdrawal_account_names: string | null
  airtel_withdrawal_number: string | null
  airtel_withdrawal_account_names: string | null
  crypto_wallet: string | null
  payout_method: NexusPayoutMethod
  last_sensitive_change_at: string | null
  cooldown_until: string | null
}

function pushLine(
  opts: RegisteredPayoutOption[],
  id: PayoutLineId,
  label: string,
  rail: string,
  network: "MTN" | "Airtel" | null,
  number: string,
  names: string,
): void {
  opts.push({
    id,
    label,
    rail,
    network,
    numberMasked: maskSensitiveValue(number, "phone"),
    accountNames: names,
  })
}

function buildPayoutOptions(row: UserSecurityProfileRow | null): RegisteredPayoutOption[] {
  if (!row) return []
  const opts: RegisteredPayoutOption[] = []
  if (lineReady(row.mtn_deposit_number, row.mtn_deposit_account_names)) {
    pushLine(
      opts,
      "mtn_deposit",
      "MTN — deposits",
      "mobile_money_mtn_deposit",
      "MTN",
      row.mtn_deposit_number!,
      row.mtn_deposit_account_names!.trim(),
    )
  }
  if (lineReady(row.airtel_deposit_number, row.airtel_deposit_account_names)) {
    pushLine(
      opts,
      "airtel_deposit",
      "Airtel — deposits",
      "mobile_money_airtel_deposit",
      "Airtel",
      row.airtel_deposit_number!,
      row.airtel_deposit_account_names!.trim(),
    )
  }
  if (lineReady(row.mtn_withdrawal_number, row.mtn_withdrawal_account_names)) {
    pushLine(
      opts,
      "mtn_withdrawal",
      "MTN — withdrawals",
      "mobile_money_mtn_withdrawal",
      "MTN",
      row.mtn_withdrawal_number!,
      row.mtn_withdrawal_account_names!.trim(),
    )
  }
  if (lineReady(row.airtel_withdrawal_number, row.airtel_withdrawal_account_names)) {
    pushLine(
      opts,
      "airtel_withdrawal",
      "Airtel — withdrawals",
      "mobile_money_airtel_withdrawal",
      "Airtel",
      row.airtel_withdrawal_number!,
      row.airtel_withdrawal_account_names!.trim(),
    )
  }
  if (
    opts.length === 0 &&
    lineReady(row.deposit_number, row.deposit_account_names)
  ) {
    pushLine(
      opts,
      "deposit_line",
      "Mobile money (deposit)",
      "mobile_money_deposit",
      null,
      row.deposit_number!,
      row.deposit_account_names!.trim(),
    )
  }
  if (
    !opts.some((o) => o.id.includes("withdrawal")) &&
    lineReady(row.withdrawal_number, row.withdrawal_account_names)
  ) {
    pushLine(
      opts,
      "withdrawal_line",
      "Mobile money (withdrawal)",
      "mobile_money_withdrawal",
      null,
      row.withdrawal_number!,
      row.withdrawal_account_names!.trim(),
    )
  }
  if (row.crypto_wallet && isValidTrc20UsdtAddress(row.crypto_wallet)) {
    opts.push({
      id: "crypto",
      label: "USDT TRC20",
      rail: "USDT_TRC20",
      network: null,
      numberMasked: maskSensitiveValue(row.crypto_wallet, "wallet"),
      accountNames: null,
    })
  }
  return opts
}

function rowToPublic(row: UserSecurityProfileRow | null): PublicSecurityProfile {
  const hasSecurityCode = Boolean(row?.security_code_hash)
  const minimumPayoutLine = row ? hasMinimumPayoutLine(row) : false
  const minimumSecurity = row ? hasMinimumSecurity(row) : false
  const cooldownUntil = row?.cooldown_until ?? null
  const inCooldown = cooldownUntil ? new Date(cooldownUntil).getTime() > Date.now() : false
  return {
    hasSecurityCode,
    hasMinimumSecurity: minimumSecurity,
    hasTransactionNumber: minimumPayoutLine,
    hasMinimumPayoutLine: minimumPayoutLine,
    needsSetup: !minimumSecurity,
    suggestsOptionalEnhancements: row ? suggestsOptionalSecurityEnhancements(row) : false,
    payoutMethod: (row?.payout_method as NexusPayoutMethod) ?? "mobile_money",
    depositNumberMasked: row?.deposit_number
      ? maskSensitiveValue(row.deposit_number, "phone")
      : null,
    withdrawalNumberMasked: row?.withdrawal_number
      ? maskSensitiveValue(row.withdrawal_number, "phone")
      : null,
    depositAccountNames: row?.deposit_account_names?.trim() || null,
    withdrawalAccountNames: row?.withdrawal_account_names?.trim() || null,
    cryptoWalletMasked: row?.crypto_wallet ? maskSensitiveValue(row.crypto_wallet, "wallet") : null,
    payoutOptions: buildPayoutOptions(row),
    cooldownUntil,
    inCooldown,
    canChangeSensitive: hasSecurityCode && !inCooldown,
    cryptoNotice: CRYPTO_WITHDRAWAL_NOTICE,
  }
}

export async function getOrCreateSecurityProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<UserSecurityProfileRow> {
  const { data, error } = await admin
    .from("user_security_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  if (data) return data as UserSecurityProfileRow

  const now = new Date().toISOString()
  const { data: ins, error: iErr } = await admin
    .from("user_security_profiles")
    .insert({ user_id: userId, updated_at: now })
    .select("*")
    .single()
  if (iErr) throw iErr
  return ins as UserSecurityProfileRow
}

export async function getPublicSecurityProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<PublicSecurityProfile> {
  const row = await getOrCreateSecurityProfile(admin, userId)
  return rowToPublic(row)
}

export function rowToSetupFields(row: UserSecurityProfileRow | null): SecurityProfileSetupFields {
  return {
    hasSecurityCode: Boolean(row?.security_code_hash),
    mtnDepositNumber: row?.mtn_deposit_number?.trim() || row?.deposit_number?.trim() || null,
    mtnDepositAccountNames:
      row?.mtn_deposit_account_names?.trim() || row?.deposit_account_names?.trim() || null,
    airtelDepositNumber: row?.airtel_deposit_number?.trim() || null,
    airtelDepositAccountNames: row?.airtel_deposit_account_names?.trim() || null,
    mtnWithdrawalNumber: row?.mtn_withdrawal_number?.trim() || row?.withdrawal_number?.trim() || null,
    mtnWithdrawalAccountNames:
      row?.mtn_withdrawal_account_names?.trim() || row?.withdrawal_account_names?.trim() || null,
    airtelWithdrawalNumber: row?.airtel_withdrawal_number?.trim() || null,
    airtelWithdrawalAccountNames: row?.airtel_withdrawal_account_names?.trim() || null,
    cryptoWallet: row?.crypto_wallet?.trim() || null,
  }
}

export function resolvePayerFromSecurityRow(
  row: UserSecurityProfileRow,
  source: PayoutLineId,
): { name: string | null; phone: string | null; network: string | null } {
  const line = resolveLineFromPayoutId(row, source)
  return { name: line.names, phone: line.number, network: line.network }
}

export async function getSecurityProfileSetupFields(
  admin: SupabaseClient,
  userId: string,
): Promise<SecurityProfileSetupFields> {
  const row = await getOrCreateSecurityProfile(admin, userId)
  return rowToSetupFields(row)
}

export function assertNotInCooldown(row: UserSecurityProfileRow): void {
  if (row.cooldown_until && new Date(row.cooldown_until).getTime() > Date.now()) {
    throw new Error(
      `Sensitive payout details are in review cooldown until ${new Date(row.cooldown_until).toISOString().slice(0, 10)}.`,
    )
  }
}

export type SetupSecurityProfileParams = {
  userId: string
  securityCode: string
  mtnDepositNumber?: string
  mtnDepositAccountNames?: string
  airtelDepositNumber?: string
  airtelDepositAccountNames?: string
  mtnWithdrawalNumber?: string
  mtnWithdrawalAccountNames?: string
  airtelWithdrawalNumber?: string
  airtelWithdrawalAccountNames?: string
  payoutMethod: NexusPayoutMethod
  cryptoWallet?: string | null
}

export async function setupSecurityProfile(
  admin: SupabaseClient,
  params: SetupSecurityProfileParams,
): Promise<PublicSecurityProfile> {
  const row = await getOrCreateSecurityProfile(admin, params.userId)
  const hasNumbers = hasMinimumPayoutLine(row)
  if (row.security_code_hash && hasNumbers) {
    throw new Error("Security profile already configured.")
  }

  const completingIncomplete = Boolean(row.security_code_hash && !hasNumbers)
  if (!completingIncomplete && !isValidSecurityCodeFormat(params.securityCode)) {
    throw new Error("Security code must be exactly 6 digits.")
  }
  if (completingIncomplete) {
    const ok = await verifySecurityCode(params.securityCode, row.security_code_hash)
    if (!ok) {
      throw new Error("Security PIN does not match your saved code. Enter the same 6-digit PIN you set earlier.")
    }
  }

  const mtnDep = normalizeDepositNumber(params.mtnDepositNumber ?? "")
  const airtelDep = normalizeDepositNumber(params.airtelDepositNumber ?? "")
  const mtnWd = normalizeWithdrawalNumber(params.mtnWithdrawalNumber ?? "")
  const airtelWd = normalizeWithdrawalNumber(params.airtelWithdrawalNumber ?? "")
  const mtnDepOk = mtnDep.length >= 8
  const airtelDepOk = airtelDep.length >= 8
  const mtnWdOk = mtnWd.length >= 8
  const airtelWdOk = airtelWd.length >= 8
  if (!mtnDepOk && !airtelDepOk && !mtnWdOk && !airtelWdOk) {
    throw new Error("Enter at least one valid MTN or Airtel number (8+ digits).")
  }
  const mtnDepNames = params.mtnDepositAccountNames?.trim() || null
  const airtelDepNames = params.airtelDepositAccountNames?.trim() || null
  const mtnWdNames = params.mtnWithdrawalAccountNames?.trim() || null
  const airtelWdNames = params.airtelWithdrawalAccountNames?.trim() || null
  if (mtnDepOk && !mtnDepNames) {
    throw new Error("Registered account names are required for the MTN deposit number.")
  }
  if (airtelDepOk && !airtelDepNames) {
    throw new Error("Registered account names are required for the Airtel deposit number.")
  }
  if (mtnWdOk && !mtnWdNames) {
    throw new Error("Registered account names are required for the MTN withdrawal number.")
  }
  if (airtelWdOk && !airtelWdNames) {
    throw new Error("Registered account names are required for the Airtel withdrawal number.")
  }

  let crypto: string | null = row.crypto_wallet
  if (params.payoutMethod === "crypto_trc20") {
    crypto = params.cryptoWallet?.trim() ?? ""
    if (!isValidTrc20UsdtAddress(crypto)) {
      throw new Error("Invalid USDT TRC20 wallet address.")
    }
  } else if (!params.cryptoWallet) {
    crypto = null
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    mtn_deposit_number: mtnDepOk ? mtnDep : row.mtn_deposit_number,
    mtn_deposit_account_names: mtnDepOk ? mtnDepNames : row.mtn_deposit_account_names,
    airtel_deposit_number: airtelDepOk ? airtelDep : row.airtel_deposit_number,
    airtel_deposit_account_names: airtelDepOk ? airtelDepNames : row.airtel_deposit_account_names,
    mtn_withdrawal_number: mtnWdOk ? mtnWd : row.mtn_withdrawal_number,
    mtn_withdrawal_account_names: mtnWdOk ? mtnWdNames : row.mtn_withdrawal_account_names,
    airtel_withdrawal_number: airtelWdOk ? airtelWd : row.airtel_withdrawal_number,
    airtel_withdrawal_account_names: airtelWdOk ? airtelWdNames : row.airtel_withdrawal_account_names,
    crypto_wallet: crypto,
    payout_method: params.payoutMethod,
    last_sensitive_change_at: now,
    updated_at: now,
  }
  syncLegacyMirrorColumns(patch, row)
  if (!completingIncomplete) {
    patch.security_code_hash = hashSecurityCode(params.securityCode)
    patch.security_code_set_at = now
  }

  const { error } = await admin.from("user_security_profiles").update(patch).eq("user_id", params.userId)
  if (error) throw error
  return getPublicSecurityProfile(admin, params.userId)
}

export async function verifyUserSecurityCode(
  admin: SupabaseClient,
  userId: string,
  code: string,
): Promise<boolean> {
  const row = await getOrCreateSecurityProfile(admin, userId)
  if (!row.security_code_hash) return false
  return verifySecurityCode(code, row.security_code_hash)
}

export function maskChangeRequestValue(type: string, value: string): string {
  if (type === "crypto_wallet") return maskSensitiveValue(value, "wallet")
  if (type === "deposit_number" || type === "withdrawal_number") {
    return maskSensitiveValue(value, "phone")
  }
  if (type === "security_code") return "******"
  return maskSensitiveValue(value, "generic")
}

export async function applyApprovedSecurityChange(
  admin: SupabaseClient,
  params: {
    userId: string
    requestType: string
    newValuePlain: string
    adminId: string
  },
): Promise<void> {
  const row = await getOrCreateSecurityProfile(admin, params.userId)
  const now = new Date().toISOString()
  const cooldown = new Date(Date.now() + SENSITIVE_CHANGE_COOLDOWN_DAYS * 86_400_000).toISOString()
  const patch: Record<string, unknown> = {
    last_sensitive_change_at: now,
    cooldown_until: cooldown,
    updated_at: now,
  }

  switch (params.requestType) {
    case "deposit_number":
      patch.deposit_number = normalizeDepositNumber(params.newValuePlain)
      break
    case "withdrawal_number":
      patch.withdrawal_number = normalizeWithdrawalNumber(params.newValuePlain)
      break
    case "crypto_wallet": {
      const w = params.newValuePlain.trim()
      if (!isValidTrc20UsdtAddress(w)) throw new Error("Invalid TRC20 address.")
      patch.crypto_wallet = w
      patch.payout_method = "crypto_trc20"
      break
    }
    case "payout_method": {
      const m = params.newValuePlain.trim() as NexusPayoutMethod
      if (m !== "mobile_money" && m !== "crypto_trc20") throw new Error("Invalid payout method.")
      patch.payout_method = m
      break
    }
    case "security_code":
      if (!isValidSecurityCodeFormat(params.newValuePlain)) throw new Error("Invalid security code.")
      patch.security_code_hash = hashSecurityCode(params.newValuePlain)
      patch.security_code_set_at = now
      break
    default:
      throw new Error("Unknown request type.")
  }

  const { error } = await admin.from("user_security_profiles").update(patch).eq("user_id", params.userId)
  if (error) throw error

  await admin.from("profiles").update({ updated_at: now }).eq("id", params.userId)
  void row
  void params.adminId
}

export function buildAdminPayoutSummary(row: UserSecurityProfileRow | null): Record<string, string> {
  if (!row) {
    return { payoutMethod: "—", route: "—", destination: "—", securityAge: "—" }
  }
  const method = row.payout_method === "crypto_trc20" ? "USDT TRC20" : "Mobile Money"
  const dest =
    row.payout_method === "crypto_trc20"
      ? row.crypto_wallet
        ? maskSensitiveValue(row.crypto_wallet, "wallet")
        : "—"
      : row.withdrawal_number
        ? maskSensitiveValue(row.withdrawal_number, "phone")
        : "—"
  const ageDays = row.last_sensitive_change_at
    ? Math.floor((Date.now() - new Date(row.last_sensitive_change_at).getTime()) / 86_400_000)
    : null
  const registeredNames =
    row.withdrawal_account_names?.trim() ||
    row.deposit_account_names?.trim() ||
    "—"
  return {
    payoutMethod: method,
    route: row.payout_method,
    destination: dest,
    depositMasked: row.deposit_number ? maskSensitiveValue(row.deposit_number, "phone") : "—",
    withdrawalMasked: row.withdrawal_number ? maskSensitiveValue(row.withdrawal_number, "phone") : "—",
    registeredNames,
    securityAge: ageDays != null ? `${ageDays} days` : "new",
    inCooldown: row.cooldown_until && new Date(row.cooldown_until) > new Date() ? "yes" : "no",
  }
}
