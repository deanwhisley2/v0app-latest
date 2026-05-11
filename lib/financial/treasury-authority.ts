import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { currencyEngine } from "@/lib/financial/currency-engine"

export type WalletType = "TREASURY" | "RETAIL" | "NEXUS_MAIN" | "EARNINGS"
export type Operation = "CREDIT" | "DEBIT"

export interface BalanceCheck {
  userId: string
  walletType: WalletType
  requiredAmount: number
  currency?: string
}

export interface BalanceMovement {
  userId: string
  walletType: WalletType
  operation: Operation
  amount: number
  currency?: string
  referenceId: string
  reason: string
  initiatedBy: string
}

type AtomicBalanceResult =
  | { success: true; old_balance: number; new_balance: number; transaction_id: string }
  | { success: false; error: string; current_balance?: number }

class TreasuryAuthority {
  async getTreasuryBalance(walletType: "MAIN_TREASURY" | "OPERATIONAL" | "RESERVE" = "MAIN_TREASURY"): Promise<number> {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("treasury_balances")
      .select("amount")
      .eq("wallet_type", walletType)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return Number((data as { amount?: unknown } | null)?.amount ?? 0)
  }

  async mutateTreasury(
    operation: "CREDIT" | "DEBIT",
    usdAmount: number,
    referenceId: string,
    reason: string,
    initiatedBy: string,
    walletType: "MAIN_TREASURY" | "OPERATIONAL" | "RESERVE" = "MAIN_TREASURY",
  ): Promise<{ success: boolean; transactionId: string; error?: string; newBalance?: number }> {
    const admin = createAdminClient()
    const transactionId = randomUUID()
    const { data, error } = await admin.rpc("update_treasury_usd", {
      p_operation: operation,
      p_usd_amount: usdAmount,
      p_wallet_type: walletType,
      p_transaction_id: transactionId,
      p_reference_id: referenceId,
      p_reason: reason,
      p_initiated_by: initiatedBy,
    })
    const res = data as { success?: boolean; error?: string; new_balance?: number } | null
    if (error || !res?.success) {
      return {
        success: false,
        transactionId,
        error: res?.error || error?.message || "Treasury mutation failed",
      }
    }
    return { success: true, transactionId, newBalance: Number(res.new_balance ?? 0) }
  }

  async getUserBalance(userId: string, walletType: "NEXUS_MAIN" | "RETAIL" | "EARNINGS", currency: string): Promise<number> {
    const admin = createAdminClient()
    const ccy = currency.toUpperCase()
    const { data, error } = await admin
      .from("user_local_balances")
      .select("amount")
      .eq("user_id", userId)
      .eq("wallet_type", walletType)
      .eq("currency", ccy)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return Number((data as { amount?: unknown } | null)?.amount ?? 0)
  }

  async mutateUserBalance(
    userId: string,
    walletType: "NEXUS_MAIN" | "RETAIL" | "EARNINGS",
    currency: string,
    operation: "CREDIT" | "DEBIT",
    amountLocal: number,
    referenceId: string,
    reason: string,
    initiatedBy: string,
  ): Promise<{ success: boolean; transactionId: string; error?: string; newBalance?: number }> {
    const admin = createAdminClient()
    const transactionId = randomUUID()
    const { data, error } = await admin.rpc("update_user_balance_local", {
      p_user_id: userId,
      p_wallet_type: walletType,
      p_currency: currency.toUpperCase(),
      p_operation: operation,
      p_amount_local: amountLocal,
      p_transaction_id: transactionId,
      p_reference_id: referenceId,
      p_reason: reason,
      p_initiated_by: initiatedBy,
    })
    const res = data as { success?: boolean; error?: string; new_balance?: number } | null
    if (error || !res?.success) {
      return {
        success: false,
        transactionId,
        error: res?.error || error?.message || "User balance mutation failed",
      }
    }
    return { success: true, transactionId, newBalance: Number(res.new_balance ?? 0) }
  }

  /**
   * RULE: Always read authoritative balance from DB (never cache).
   * Note: balances rows are service-role only by default in this migration.
   */
  async getBalance(userId: string, walletType: WalletType, currency: string = "UGX"): Promise<number> {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("balances")
      .select("amount")
      .eq("user_id", userId)
      .eq("wallet_type", walletType)
      .eq("currency", currency)
      .maybeSingle()

    if (error) throw new Error(error.message)
    const amount = data?.amount
    return typeof amount === "number" ? amount : Number(amount ?? 0)
  }

  async validateSufficientBalance(check: BalanceCheck): Promise<{
    allowed: boolean
    currentBalance: number
    reason?: string
  }> {
    const currentBalance = await this.getBalance(check.userId, check.walletType, check.currency ?? "UGX")
    if (currentBalance < check.requiredAmount) {
      return {
        allowed: false,
        currentBalance,
        reason: `Insufficient ${check.walletType} balance: ${currentBalance} < ${check.requiredAmount}`,
      }
    }
    return { allowed: true, currentBalance }
  }

  /**
   * RULE: Atomic mutation (single-writer RPC in Postgres).
   */
  async executeMovement(movement: BalanceMovement): Promise<{
    success: boolean
    transactionId: string
    error?: string
    newBalance?: number
    oldBalance?: number
  }> {
    const admin = createAdminClient()
    const transactionId = randomUUID()

    const { data, error } = await admin.rpc("atomic_balance_update", {
      p_user_id: movement.userId,
      p_wallet_type: movement.walletType,
      p_operation: movement.operation,
      p_amount: movement.amount,
      p_currency: movement.currency ?? "UGX",
      p_transaction_id: transactionId,
      p_reference_id: movement.referenceId,
      p_reason: movement.reason,
      p_initiated_by: movement.initiatedBy,
    })

    if (error) {
      return { success: false, transactionId, error: error.message }
    }

    const res = data as AtomicBalanceResult | null
    if (!res || res.success !== true) {
      return {
        success: false,
        transactionId,
        error: res && "error" in res ? res.error : "Transaction failed",
      }
    }

    return {
      success: true,
      transactionId,
      newBalance: res.new_balance,
      oldBalance: res.old_balance,
    }
  }

  async executeCurrencyMovement(movement: BalanceMovement): Promise<{
    success: boolean
    transactionId: string
    error?: string
    conversion?: {
      originalAmount: number
      originalCurrency: string
      usdEquivalent: number
      rateUsed: number
    }
    newBalanceLocal?: number
    newBalanceUsd?: number
  }> {
    const admin = createAdminClient()
    const transactionId = randomUUID()
    const currency = (movement.currency ?? "UGX").toUpperCase()
    const rateToUsd = await currencyEngine.getRate(currency, "USD")

    const { data, error } = await admin.rpc("atomic_currency_balance_update", {
      p_user_id: movement.userId,
      p_wallet_type: movement.walletType,
      p_currency: currency,
      p_operation: movement.operation,
      p_amount: movement.amount,
      p_usd_rate: rateToUsd,
      p_transaction_id: transactionId,
      p_reference_id: movement.referenceId,
      p_reason: movement.reason,
      p_initiated_by: movement.initiatedBy,
    })

    if (error) {
      return { success: false, transactionId, error: error.message }
    }

    const res = data as
      | {
          success: true
          new_balance_local: number
          new_balance_usd: number
          usd_amount: number
          rate_used: number
        }
      | { success: false; error: string }
      | null

    if (!res || res.success !== true) {
      return {
        success: false,
        transactionId,
        error: res && "error" in res ? res.error : "Currency transaction failed",
      }
    }

    return {
      success: true,
      transactionId,
      conversion: {
        originalAmount: movement.amount,
        originalCurrency: currency,
        usdEquivalent: Number(res.usd_amount),
        rateUsed: Number(res.rate_used),
      },
      newBalanceLocal: Number(res.new_balance_local),
      newBalanceUsd: Number(res.new_balance_usd),
    }
  }

  async getUSDBalance(userId: string, walletType: WalletType, currency: string = "UGX"): Promise<number> {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("balances")
      .select("usd_equivalent")
      .eq("user_id", userId)
      .eq("wallet_type", walletType)
      .eq("currency", currency)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return Number((data as { usd_equivalent?: unknown } | null)?.usd_equivalent ?? 0)
  }
}

export const treasury = new TreasuryAuthority()

