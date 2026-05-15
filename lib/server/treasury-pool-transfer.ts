import type { SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import {
  isTreasuryPoolWallet,
  TREASURY_POOL_AUTO_APPROVAL,
  TREASURY_POOL_RESERVE,
  type TreasuryPoolWallet,
} from "@/lib/server/treasury-pool-types"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

export async function transferTreasuryBetweenPools(
  admin: SupabaseClient,
  params: {
    fromPool: TreasuryPoolWallet
    toPool: TreasuryPoolWallet
    amountUsd: number
    reason: string
    initiatedBy: string
  },
): Promise<{
  fromBalanceUsd: number
  toBalanceUsd: number
  transactionId: string
}> {
  const amountUsd = roundUsd2(params.amountUsd)
  if (!(amountUsd > 0)) throw new Error("Transfer amount must be positive.")
  if (params.fromPool === params.toPool) throw new Error("Choose two different pools.")
  if (!isTreasuryPoolWallet(params.fromPool) || !isTreasuryPoolWallet(params.toPool)) {
    throw new Error("Invalid treasury pool.")
  }

  const transactionId = randomUUID()
  const referenceId = `treasury_xfer:${params.fromPool}:${params.toPool}:${Date.now()}`
  const { data, error } = await admin.rpc("transfer_treasury_usd", {
    p_from_wallet: params.fromPool,
    p_to_wallet: params.toPool,
    p_usd_amount: amountUsd,
    p_transaction_id: transactionId,
    p_reference_id: referenceId,
    p_reason: params.reason.slice(0, 500),
    p_initiated_by: params.initiatedBy,
  })

  const res = data as {
    success?: boolean
    error?: string
    from_balance?: number
    to_balance?: number
  } | null

  if (error || !res?.success) {
    throw new Error(res?.error || error?.message || "Treasury transfer failed.")
  }

  return {
    fromBalanceUsd: Number(res.from_balance ?? 0),
    toBalanceUsd: Number(res.to_balance ?? 0),
    transactionId,
  }
}

export function defaultFundApprovalsTransfer(): {
  fromPool: typeof TREASURY_POOL_RESERVE
  toPool: typeof TREASURY_POOL_AUTO_APPROVAL
} {
  return { fromPool: TREASURY_POOL_RESERVE, toPool: TREASURY_POOL_AUTO_APPROVAL }
}

export function sweepApprovalsTransfer(): {
  fromPool: typeof TREASURY_POOL_AUTO_APPROVAL
  toPool: typeof TREASURY_POOL_RESERVE
} {
  return { fromPool: TREASURY_POOL_AUTO_APPROVAL, toPool: TREASURY_POOL_RESERVE }
}
