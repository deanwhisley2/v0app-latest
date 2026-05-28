/**
 * Network-tagged mobile-money lines on user_security_profiles.
 * Legacy deposit_number / withdrawal_number mirror the first filled line per direction.
 */

export type MobileMoneyNetwork = "MTN" | "Airtel"

export type PayoutLineId =
  | "mtn_deposit"
  | "airtel_deposit"
  | "mtn_withdrawal"
  | "airtel_withdrawal"
  | "deposit_line"
  | "withdrawal_line"
  | "crypto"

export type MobileMoneyLineFields = {
  mtn_deposit_number?: string | null
  mtn_deposit_account_names?: string | null
  airtel_deposit_number?: string | null
  airtel_deposit_account_names?: string | null
  mtn_withdrawal_number?: string | null
  mtn_withdrawal_account_names?: string | null
  airtel_withdrawal_number?: string | null
  airtel_withdrawal_account_names?: string | null
  deposit_number?: string | null
  deposit_account_names?: string | null
  withdrawal_number?: string | null
  withdrawal_account_names?: string | null
}

export function lineReady(number?: string | null, names?: string | null): boolean {
  return Boolean(number?.trim() && names?.trim())
}

export function hasAnyNetworkPayoutLine(row: MobileMoneyLineFields): boolean {
  return (
    lineReady(row.mtn_deposit_number, row.mtn_deposit_account_names) ||
    lineReady(row.airtel_deposit_number, row.airtel_deposit_account_names) ||
    lineReady(row.mtn_withdrawal_number, row.mtn_withdrawal_account_names) ||
    lineReady(row.airtel_withdrawal_number, row.airtel_withdrawal_account_names) ||
    lineReady(row.deposit_number, row.deposit_account_names) ||
    lineReady(row.withdrawal_number, row.withdrawal_account_names)
  )
}

export function resolveLineFromPayoutId(
  row: MobileMoneyLineFields,
  id: PayoutLineId,
): { number: string | null; names: string | null; network: MobileMoneyNetwork | null } {
  switch (id) {
    case "mtn_deposit":
      return {
        number: row.mtn_deposit_number?.trim() || null,
        names: row.mtn_deposit_account_names?.trim() || null,
        network: "MTN",
      }
    case "airtel_deposit":
      return {
        number: row.airtel_deposit_number?.trim() || null,
        names: row.airtel_deposit_account_names?.trim() || null,
        network: "Airtel",
      }
    case "mtn_withdrawal":
      return {
        number: row.mtn_withdrawal_number?.trim() || null,
        names: row.mtn_withdrawal_account_names?.trim() || null,
        network: "MTN",
      }
    case "airtel_withdrawal":
      return {
        number: row.airtel_withdrawal_number?.trim() || null,
        names: row.airtel_withdrawal_account_names?.trim() || null,
        network: "Airtel",
      }
    case "deposit_line":
      if (lineReady(row.mtn_deposit_number, row.mtn_deposit_account_names)) {
        return {
          number: row.mtn_deposit_number!.trim(),
          names: row.mtn_deposit_account_names!.trim(),
          network: "MTN",
        }
      }
      if (lineReady(row.airtel_deposit_number, row.airtel_deposit_account_names)) {
        return {
          number: row.airtel_deposit_number!.trim(),
          names: row.airtel_deposit_account_names!.trim(),
          network: "Airtel",
        }
      }
      return {
        number: row.deposit_number?.trim() || null,
        names: row.deposit_account_names?.trim() || null,
        network: null,
      }
    case "withdrawal_line":
      if (lineReady(row.mtn_withdrawal_number, row.mtn_withdrawal_account_names)) {
        return {
          number: row.mtn_withdrawal_number!.trim(),
          names: row.mtn_withdrawal_account_names!.trim(),
          network: "MTN",
        }
      }
      if (lineReady(row.airtel_withdrawal_number, row.airtel_withdrawal_account_names)) {
        return {
          number: row.airtel_withdrawal_number!.trim(),
          names: row.airtel_withdrawal_account_names!.trim(),
          network: "Airtel",
        }
      }
      return {
        number: row.withdrawal_number?.trim() || null,
        names: row.withdrawal_account_names?.trim() || null,
        network: null,
      }
    default:
      return { number: null, names: null, network: null }
  }
}

/** Pick deposit line for funding when user chose a network rail in the UI. */
export function fundPayerSourceForNetwork(
  row: MobileMoneyLineFields,
  network: string | null,
): PayoutLineId | null {
  const n = network?.trim().toUpperCase()
  if (n === "MTN" && lineReady(row.mtn_deposit_number, row.mtn_deposit_account_names)) {
    return "mtn_deposit"
  }
  if (n === "AIRTEL" && lineReady(row.airtel_deposit_number, row.airtel_deposit_account_names)) {
    return "airtel_deposit"
  }
  if (lineReady(row.mtn_deposit_number, row.mtn_deposit_account_names)) return "mtn_deposit"
  if (lineReady(row.airtel_deposit_number, row.airtel_deposit_account_names)) return "airtel_deposit"
  if (lineReady(row.deposit_number, row.deposit_account_names)) return "deposit_line"
  if (lineReady(row.mtn_withdrawal_number, row.mtn_withdrawal_account_names)) return "mtn_withdrawal"
  if (lineReady(row.airtel_withdrawal_number, row.airtel_withdrawal_account_names)) return "airtel_withdrawal"
  if (lineReady(row.withdrawal_number, row.withdrawal_account_names)) return "withdrawal_line"
  return null
}

export function syncLegacyMirrorColumns(patch: Record<string, unknown>, row: MobileMoneyLineFields): void {
  const depositNum =
    (patch.mtn_deposit_number as string | undefined)?.trim() ||
    row.mtn_deposit_number?.trim() ||
    (patch.airtel_deposit_number as string | undefined)?.trim() ||
    row.airtel_deposit_number?.trim() ||
    null
  const depositNames =
    (patch.mtn_deposit_account_names as string | undefined)?.trim() ||
    row.mtn_deposit_account_names?.trim() ||
    (patch.airtel_deposit_account_names as string | undefined)?.trim() ||
    row.airtel_deposit_account_names?.trim() ||
    null
  const withdrawalNum =
    (patch.mtn_withdrawal_number as string | undefined)?.trim() ||
    row.mtn_withdrawal_number?.trim() ||
    (patch.airtel_withdrawal_number as string | undefined)?.trim() ||
    row.airtel_withdrawal_number?.trim() ||
    null
  const withdrawalNames =
    (patch.mtn_withdrawal_account_names as string | undefined)?.trim() ||
    row.mtn_withdrawal_account_names?.trim() ||
    (patch.airtel_withdrawal_account_names as string | undefined)?.trim() ||
    row.airtel_withdrawal_account_names?.trim() ||
    null

  if (depositNum) {
    patch.deposit_number = depositNum
    if (depositNames) patch.deposit_account_names = depositNames
  }
  if (withdrawalNum) {
    patch.withdrawal_number = withdrawalNum
    if (withdrawalNames) patch.withdrawal_account_names = withdrawalNames
  }
}
