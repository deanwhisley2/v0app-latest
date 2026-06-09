import {
  WITHDRAWAL_REJECTION_COOLDOWN_MS,
  WITHDRAWAL_REJECTION_COOLDOWN_THRESHOLD,
  formatRejectionCooldownClock,
} from "../lib/server/withdrawal-rejection-cooldown"

console.assert(WITHDRAWAL_REJECTION_COOLDOWN_THRESHOLD === 2, "threshold is 2")
console.assert(WITHDRAWAL_REJECTION_COOLDOWN_MS === 5 * 60 * 60 * 1000, "cooldown is 5h")
console.assert(formatRejectionCooldownClock(3_661_000) === "01:01:01", "clock format")
console.log("PASS — withdrawal rejection cooldown constants")
