/** JSON from Postgres RPC `fixed_trade_calculate_withdrawable_v1` / `fixed_trade_release_earnings_window_v1`. */
export type FixedTradeWithdrawableRpcBase = {
  ok: boolean
  error?: string
  window_open?: boolean
  next_unlock_at?: string
  remaining_duration_seconds?: number
  remaining_duration_phrase?: string
  user_message?: string
  current_accrued_gross_usd?: number
  cumulative_released_gross_usd?: number
  headroom_usd?: number
  withdraw_percent?: number
  eligible_percent_next_window?: number
  withdrawable_gross_usd?: number
  release_fee_rate?: number
  next_unlock_day_index?: number
  session_day_index?: number
  current_window_index?: number
  last_release_window_index?: number
}

export type FixedTradeReleaseRpcSuccess = FixedTradeWithdrawableRpcBase & {
  ok: true
  idempotent?: boolean
  replay?: boolean
  released_gross_usd?: number
  fee_usd?: number
  credited_liquid_usd?: number
  cumulative_released_usd?: number
  policy_gross_usd?: number
  available_balance?: number
  container_withdrawable_earnings?: number
  transaction_ref?: string
  release_window_index?: number
}
