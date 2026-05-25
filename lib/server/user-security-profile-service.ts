import type { SupabaseClient } from "@supabase/supabase-js"
import {
  fingerprintValue,
  hashSecurityCode,
  isValidSecurityCodeFormat,
  maskSensitiveValue,
  verifySecurityCode,
} from "@/lib/nexus-security-code"
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
  crypto_wallet: string | null
  payout_method: NexusPayoutMethod
  last_sensitive_change_at: string | null
  cooldown_until: string | null
}

export type PublicSecurityProfile = {
  hasSecurityCode: boolean
  needsSetup: boolean
  payoutMethod: NexusPayoutMethod
  depositNumberMasked: string | null
  withdrawalNumberMasked: string | null
  cryptoWalletMasked: string | null
  cooldownUntil: string | null
  inCooldown: boolean
  canChangeSensitive: boolean
  cryptoNotice: string
}

function rowToPublic(row: UserSecurityProfileRow | null): PublicSecurityProfile {
  const hasSecurityCode = Boolean(row?.security_code_hash)
  const cooldownUntil = row?.cooldown_until ?? null
  const inCooldown = cooldownUntil ? new Date(cooldownUntil).getTime() > Date.now() : false
  return {
    hasSecurityCode,
    needsSetup: !hasSecurityCode,
    payoutMethod: (row?.payout_method as NexusPayoutMethod) ?? "mobile_money",
    depositNumberMasked: row?.deposit_number
      ? maskSensitiveValue(row.deposit_number, "phone")
      : null,
    withdrawalNumberMasked: row?.withdrawal_number
      ? maskSensitiveValue(row.withdrawal_number, "phone")
      : null,
    cryptoWalletMasked: row?.crypto_wallet ? maskSensitiveValue(row.crypto_wallet, "wallet") : null,
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

export function assertNotInCooldown(row: UserSecurityProfileRow): void {
  if (row.cooldown_until && new Date(row.cooldown_until).getTime() > Date.now()) {
    throw new Error(
      `Sensitive payout details are in review cooldown until ${new Date(row.cooldown_until).toISOString().slice(0, 10)}.`,
    )
  }
}

export async function setupSecurityProfile(
  admin: SupabaseClient,
  params: {
    userId: string
    securityCode: string
    depositNumber: string
    withdrawalNumber: string
    payoutMethod: NexusPayoutMethod
    cryptoWallet?: string | null
  },
): Promise<PublicSecurityProfile> {
  const row = await getOrCreateSecurityProfile(admin, params.userId)
  if (row.security_code_hash) {
    throw new Error("Security profile already configured.")
  }
  if (!isValidSecurityCodeFormat(params.securityCode)) {
    throw new Error("Security code must be exactly 6 digits.")
  }
  const deposit = normalizeDepositNumber(params.depositNumber)
  const withdrawal = normalizeWithdrawalNumber(params.withdrawalNumber)
  if (!deposit || deposit.length < 8) throw new Error("Deposit number is required.")
  if (!withdrawal || withdrawal.length < 8) throw new Error("Withdrawal number is required.")

  let crypto: string | null = null
  if (params.payoutMethod === "crypto_trc20") {
    crypto = params.cryptoWallet?.trim() ?? ""
    if (!isValidTrc20UsdtAddress(crypto)) {
      throw new Error("Invalid USDT TRC20 wallet address.")
    }
  }

  const now = new Date().toISOString()
  const { error } = await admin
    .from("user_security_profiles")
    .update({
      security_code_hash: hashSecurityCode(params.securityCode),
      security_code_set_at: now,
      deposit_number: deposit,
      withdrawal_number: withdrawal,
      crypto_wallet: crypto,
      payout_method: params.payoutMethod,
      last_sensitive_change_at: now,
      updated_at: now,
    })
    .eq("user_id", params.userId)
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
  return {
    payoutMethod: method,
    route: row.payout_method,
    destination: dest,
    depositMasked: row.deposit_number ? maskSensitiveValue(row.deposit_number, "phone") : "—",
    securityAge: ageDays != null ? `${ageDays} days` : "new",
    inCooldown: row.cooldown_until && new Date(row.cooldown_until) > new Date() ? "yes" : "no",
  }
}
