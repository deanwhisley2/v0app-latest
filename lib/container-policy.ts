/**
 * Container Mode institutional policy — USD-normalized accounting units.
 * UI may convert display; servers enforce using these constants.
 */

/** Minimum copy-trade stake (USD). */
export const CONTAINER_COPY_MIN_STAKE_USD = 7

/** Minimum fixed-trade principal (USD). */
export const CONTAINER_FIX_MIN_PRINCIPAL_USD = 5

/** Fixed band 2: funding within first N days from profile creation (spec: two weeks). */
export const CONTAINER_FIX_BAND2_WINDOW_DAYS = 14

/** Unlock advanced fixed band when funding in window reaches this USD total. */
export const CONTAINER_FIX_BAND2_WINDOW_FUNDING_USD = 100

/** Alternate path: valid referrals needed to unlock band 2 without window funding. */
export const CONTAINER_FIX_BAND2_VALID_REF_PATH_MIN = 10

/** Referee counts as valid when funded at least this much (USD) and has fixed-trade history. */
export const CONTAINER_VALID_REFEREE_MIN_FUNDED_USD = 5
