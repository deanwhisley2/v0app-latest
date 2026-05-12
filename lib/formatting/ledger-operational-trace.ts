/**
 * Human-readable lines for institutional-grade ledger visibility (L5 funding modes, etc.).
 */

export type LedgerTraceRow = {
  metadata?: unknown
  balance_source?: string | null
  balance_destination?: string | null
}

function fmtApprovalMode(m: string): string {
  if (m === "treasury_pool") return "Treasury pool — MAIN_TREASURY debited"
  if (m === "retailer_retail_balance") return "Retailer liquidity — desk retail_balance debited"
  return m
}

function fmtFundingSource(s: string): string {
  if (s === "company_treasury_pool") return "Company treasury pool"
  if (s === "retailer_retail_balance") return "Retailer Retail Balance"
  return s
}

function fmtAccount(a: string): string {
  if (a === "MAIN_TREASURY") return "MAIN_TREASURY (company)"
  if (a === "retailer_retail_balance") return "Retailer retail_balance"
  if (a === "customer_nexus_main_available") return "Customer Nexus Main (available)"
  return a
}

/** Non-empty lines suitable for UI lists (admin desk + user history). */
export function ledgerOperationalTraceLines(row: LedgerTraceRow): string[] {
  const lines: string[] = []
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null

  const mode = meta?.approvalMode
  if (typeof mode === "string") {
    lines.push(`Settlement mode: ${fmtApprovalMode(mode)}`)
  }

  const funding = meta?.fundingSource
  if (typeof funding === "string") {
    lines.push(`Funding source: ${fmtFundingSource(funding)}`)
  }

  const cls = meta?.approvalClassification
  if (typeof cls === "string") {
    lines.push(`Classification: ${cls}`)
  }

  const auth = meta?.actingAuthority
  if (typeof auth === "string") {
    lines.push(`Acting authority: ${auth === "level_5_admin" ? "Level 5 admin" : auth}`)
  }

  const debit = meta?.debitedAccount
  if (typeof debit === "string") {
    lines.push(`Debited account: ${fmtAccount(debit)}`)
  }

  const credit = meta?.creditedAccount
  if (typeof credit === "string") {
    lines.push(`Credited account: ${fmtAccount(credit)}`)
  }

  if (row.balance_source || row.balance_destination) {
    lines.push(
      `Book entry: ${String(row.balance_source ?? "—")} → ${String(row.balance_destination ?? "—")}`,
    )
  }

  return lines
}
