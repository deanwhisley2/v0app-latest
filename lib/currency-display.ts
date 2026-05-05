/** Approximate USD → local rates for display (container / wallet copy). Not FX trading quotes. */
export const USD_TO_FX: Record<string, number> = {
  USD: 1,
  UGX: 3750,
  KES: 130,
  TZS: 2520,
  RWF: 1350,
  NGN: 1550,
  GHS: 15.5,
  ZAR: 18.2,
  XOF: 605,
  XAF: 605,
  MAD: 10.1,
  EGP: 48,
  ETB: 57,
  ZMW: 27,
  MWK: 1730,
}

export type FiatCurrencyCode = keyof typeof USD_TO_FX

export function isSupportedFiat(code: string): code is FiatCurrencyCode {
  return code in USD_TO_FX
}

export function convertFromUsd(amountUsd: number, currency: string): number {
  const rate = USD_TO_FX[currency as FiatCurrencyCode] ?? USD_TO_FX.USD
  return amountUsd * rate
}

export function formatMoneyAmount(amountUsd: number, currency: string, locale: string): string {
  const c = isSupportedFiat(currency) ? currency : "USD"
  const local = convertFromUsd(amountUsd, c)
  try {
    return new Intl.NumberFormat(locale || "en", {
      style: "currency",
      currency: c,
      maximumFractionDigits: c === "UGX" || c === "TZS" || c === "RWF" || c === "MWK" ? 0 : 2,
    }).format(local)
  } catch {
    return `${c} ${local.toFixed(0)}`
  }
}
