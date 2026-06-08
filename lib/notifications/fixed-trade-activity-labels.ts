/** Customer-facing History / Activity titles for fixed-trade ledger events. */

export function fixedTradeActivityTitle(eventType: string): string | null {
  switch (eventType) {
    case "fixed_trade_principal_lock":
    case "fixed_trade_insurance_fee":
      return "Trade session allocation active"
    case "fixed_trade_earnings_to_container_liquid":
    case "fixed_trade_earnings_release":
    case "container_to_withdrawable":
    case "withdrawable_to_main":
      return "Trade session earnings credited"
    case "fixed_trade_maturity_principal_to_main":
    case "fixed_trade_early_exit_settlement":
    case "fixed_trade_maturity_earnings_release":
      return "Trade session completed"
  }
  return null
}
