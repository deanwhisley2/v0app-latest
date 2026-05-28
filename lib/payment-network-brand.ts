/** Canonical network logo paths and display labels (UI-only). */

export type PaymentNetworkKey = "MTN" | "Airtel" | "USDT_TRC20" | "MPesa" | "nexus"

export const PAYMENT_NETWORK_LOGO: Record<PaymentNetworkKey, string | null> = {
  MTN: "/brand/networks/mtn-momo.png",
  Airtel: "/brand/networks/airtel.png",
  USDT_TRC20: "/brand/networks/usdt-trc20.png",
  MPesa: null,
  nexus: null,
}

export const PAYMENT_NETWORK_LABEL: Record<PaymentNetworkKey, string> = {
  MTN: "MTN Mobile Money",
  Airtel: "Airtel Money",
  USDT_TRC20: "USDT · TRC20",
  MPesa: "M-Pesa",
  nexus: "Nexus",
}

export function networkKeyFromSelection(raw: string | null | undefined): PaymentNetworkKey | null {
  const n = String(raw ?? "")
    .trim()
    .toUpperCase()
  if (n === "MTN") return "MTN"
  if (n === "AIRTEL") return "Airtel"
  if (n.includes("MPESA") || n === "M-PESA") return "MPesa"
  if (n.includes("USDT") || n.includes("TRC20") || n === "CRYPTO") return "USDT_TRC20"
  return null
}

export function networkKeyFromPayoutRail(rail: string | null | undefined): PaymentNetworkKey | null {
  const r = String(rail ?? "").toUpperCase()
  if (r.includes("USDT") || r.includes("TRC20")) return "USDT_TRC20"
  if (r.includes("MTN")) return "MTN"
  if (r.includes("AIRTEL")) return "Airtel"
  if (r.includes("MPESA")) return "MPesa"
  return null
}
