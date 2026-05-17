/**
 * Procedural Container Mode “social proof” lines. Client-only (no websocket/Redis/cron).
 * Amounts scale to the viewer’s liquid USD anchor; names deduped per local day.
 */

import type { FiatCurrencyCode } from "@/lib/currency-display"

export const TESTIMONIAL_COUNTRIES: { country: string; currency: FiatCurrencyCode }[] = [
  { country: "Kenya", currency: "KES" },
  { country: "Uganda", currency: "UGX" },
  { country: "Rwanda", currency: "RWF" },
  { country: "Tanzania", currency: "TZS" },
  { country: "Nigeria", currency: "NGN" },
  { country: "Ghana", currency: "GHS" },
  { country: "South Africa", currency: "ZAR" },
  { country: "Ethiopia", currency: "ETB" },
  { country: "Zambia", currency: "ZMW" },
  { country: "Malawi", currency: "MWK" },
  { country: "Botswana", currency: "ZAR" },
  { country: "Senegal", currency: "XOF" },
  { country: "Côte d'Ivoire", currency: "XOF" },
  { country: "Cameroon", currency: "XAF" },
  { country: "Egypt", currency: "EGP" },
  { country: "Morocco", currency: "MAD" },
  { country: "Mozambique", currency: "USD" },
  { country: "Zimbabwe", currency: "USD" },
  { country: "Burkina Faso", currency: "XOF" },
  { country: "Gabon", currency: "XAF" },
]

const FIRST_NAMES = [
  "James", "Samuel", "Musa", "Zainab", "Esther", "Abdul", "David", "Sarah", "Amina", "Aisha",
  "Grace", "Kwame", "Nkechi", "Kofi", "Yaa", "Emmanuel", "Chioma", "Ibrahim", "Fatima", "Peter",
  "John", "Mary", "Joseph", "Ruth", "Daniel", "Hannah", "Michael", "Elizabeth", "Paul", "Lucy",
  "Simon", "Martha", "Andrew", "Rebecca", "Thomas", "Catherine", "Mark", "Janet", "Stephen", "Joyce",
  "Cecilia", "Benjamin", "Patience", "Joshua", "Mercy", "Isaac", "Priscilla", "Jonathan", "Tabitha",
  "Caleb", "Beatrice", "Nathan", "Dorothy", "Aaron", "Florence", "Gideon", "Victoria", "Timothy",
  "Rachel", "Noah", "Naomi", "Jacob", "Deborah", "Moses", "Anna", "Solomon", "Elias", "Lydia",
  "Gabriel", "Sariah", "Elijah", "Halima", "Enoch", "Zara", "Barak", "Nadia", "Omar", "Leila",
  "Tariq", "Yusuf", "Aaliyah", "Malik", "Imani",
]

const LAST_INITIALS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("")

export type TestimonialViewerTier = "starter" | "builder" | "growth" | "pro" | "elite"

/** Max testimonial strips per local calendar day (per user). */
export const MAX_TESTIMONIALS_PER_DAY = 12

export type DailyTestimonialState = {
  day: string
  namesUsed: string[]
  shownCount: number
  /** Recent USD amounts (for variety). */
  recentUsd: number[]
}

const STORAGE_PREFIX = "nexus_testimonial_daily_v2"

function storageKey(userId?: string | null): string {
  return `${STORAGE_PREFIX}:${userId ?? "anon"}`
}

function localDayString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function msUntilEndOfLocalDay(now: Date): number {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return Math.max(60_000, end.getTime() - now.getTime())
}

export function readDailyTestimonialState(userId?: string | null): DailyTestimonialState {
  if (typeof window === "undefined") {
    return { day: "", namesUsed: [], shownCount: 0, recentUsd: [] }
  }
  const today = localDayString(new Date())
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return { day: today, namesUsed: [], shownCount: 0, recentUsd: [] }
    const j = JSON.parse(raw) as Partial<DailyTestimonialState>
    if (j.day !== today) return { day: today, namesUsed: [], shownCount: 0, recentUsd: [] }
    return {
      day: today,
      namesUsed: Array.isArray(j.namesUsed) ? j.namesUsed : [],
      shownCount: typeof j.shownCount === "number" ? j.shownCount : 0,
      recentUsd: Array.isArray(j.recentUsd) ? j.recentUsd.filter((n) => typeof n === "number") : [],
    }
  } catch {
    return { day: today, namesUsed: [], shownCount: 0, recentUsd: [] }
  }
}

export function canShowMoreTestimonialsToday(userId?: string | null): boolean {
  return readDailyTestimonialState(userId).shownCount < MAX_TESTIMONIALS_PER_DAY
}

export function recordTestimonialShown(
  displayName: string,
  userId?: string | null,
  amountUsd?: number
): DailyTestimonialState {
  if (typeof window === "undefined") {
    return { day: "", namesUsed: [], shownCount: 0, recentUsd: [] }
  }
  const today = localDayString(new Date())
  const prev = readDailyTestimonialState(userId)
  const namesUsed =
    prev.day === today && !prev.namesUsed.includes(displayName)
      ? [...prev.namesUsed, displayName]
      : prev.day === today
        ? prev.namesUsed
        : [displayName]
  const shownCount = prev.day === today ? prev.shownCount + 1 : 1
  const recentUsd =
    prev.day === today && typeof amountUsd === "number"
      ? [...prev.recentUsd, amountUsd].slice(-8)
      : typeof amountUsd === "number"
        ? [amountUsd]
        : []
  const next: DailyTestimonialState = { day: today, namesUsed, shownCount, recentUsd }
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

/** Liquid USD anchor for tiering (main + retail + active container earnings). */
export function resolveViewerUsdAnchor(parts: {
  mainBalanceUsd?: number
  retailBalanceUsd?: number
  activeContainerEarningsUsd?: number
}): number {
  const main = Math.max(0, Number(parts.mainBalanceUsd ?? 0))
  const retail = Math.max(0, Number(parts.retailBalanceUsd ?? 0))
  const container = Math.max(0, Number(parts.activeContainerEarningsUsd ?? 0))
  return main + retail + container * 0.35
}

/**
 * Map viewer liquidity to a testimonial tier so amounts feel relatable.
 * (300k in local fiat ≈ low thousands USD → growth, not elite 10M+ stories.)
 */
export function resolveTestimonialViewerTier(usdAnchor: number): TestimonialViewerTier {
  const v = Math.max(0, usdAnchor)
  if (v < 750) return "starter"
  if (v < 7_500) return "builder"
  if (v < 75_000) return "growth"
  if (v < 400_000) return "pro"
  return "elite"
}

/** mulberry32 PRNG */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type PeriodMonths = 1 | 3 | 6

type AmountBand = { min: number; max: number }

function amountBand(tier: TestimonialViewerTier, period: PeriodMonths): AmountBand {
  const bands: Record<TestimonialViewerTier, Record<PeriodMonths, AmountBand>> = {
    starter: {
      1: { min: 28, max: 165 },
      3: { min: 95, max: 580 },
      6: { min: 240, max: 1_450 },
    },
    builder: {
      1: { min: 45, max: 380 },
      3: { min: 160, max: 2_100 },
      6: { min: 420, max: 5_800 },
    },
    growth: {
      1: { min: 85, max: 1_050 },
      3: { min: 320, max: 7_500 },
      6: { min: 880, max: 24_000 },
    },
    pro: {
      1: { min: 220, max: 3_800 },
      3: { min: 900, max: 26_000 },
      6: { min: 2_800, max: 95_000 },
    },
    elite: {
      1: { min: 550, max: 9_500 },
      3: { min: 2_400, max: 72_000 },
      6: { min: 7_500, max: 480_000 },
    },
  }
  return bands[tier][period]
}

/** Relatable profit headline in USD for the viewer’s tier (before formatUserMoney). */
export function usdForStory(
  period: PeriodMonths,
  rnd: () => number,
  tier: TestimonialViewerTier
): number {
  const { min, max } = amountBand(tier, period)
  const roll = min + rnd() * (max - min)
  return Math.round(roll)
}

function amountTooSimilar(usd: number, recent: number[]): boolean {
  return recent.some((r) => Math.abs(r - usd) / Math.max(r, usd, 1) < 0.12)
}

const PERIOD_LABEL: Record<PeriodMonths, string> = {
  1: "1 month",
  3: "3 months",
  6: "6 months",
}

const EMOJI = ["", " 🔥", " 💰", " ✨", ""]

function templateLine(
  t: number,
  displayName: string,
  country: string,
  formatted: string,
  period: PeriodMonths,
  emoji: string
): string {
  const p = PERIOD_LABEL[period]
  switch (t % 11) {
    case 0:
      return `${displayName} from ${country} just earned ${formatted} in ${p} with Container Mode${emoji}`
    case 1:
      return `${displayName} from ${country} hit ${formatted} in ${p} trading Container Mode!`
    case 2:
      return `${displayName} from ${country} started small and is now earning daily passive income with Container Mode${emoji}`
    case 3:
      return `${displayName} from ${country} made ${formatted} in ${p} — Container Mode changed everything!`
    case 4:
      return `${displayName} from ${country} just cashed out ${formatted} from Container Mode!`
    case 5:
      return `${displayName} from ${country} is now earning daily thanks to Container Mode. Started small, growing big${emoji}`
    case 6:
      return `${displayName} from ${country} earned ${formatted} with Container Mode. Best move this year!`
    case 7:
      return `Container Mode helped ${displayName} from ${country} reach ${formatted} in ${p}!`
    case 8:
      return `${displayName} from ${country} turned steady deposits into ${formatted} in ${p} on Container Mode${emoji}`
    case 9:
      return `${displayName} from ${country} locked in ${p} and scaled to ${formatted} with Container Mode!`
    default:
      return `${displayName} from ${country} — ${formatted} in ${p} with Container Mode. Motivated and consistent${emoji}`
  }
}

export type PickTestimonialOpts = {
  formatUserMoney: (amountUsd: number) => string
  userId?: string | null
  /** Viewer liquid USD anchor — drives tier caps. */
  viewerUsdAnchor?: number
  random?: () => number
  namesBlocklist?: Set<string>
}

export function pickContainerTestimonialLine(opts: PickTestimonialOpts): {
  line: string
  displayName: string
  amountUsd: number
} | null {
  const rnd = opts.random ?? Math.random
  const daily = readDailyTestimonialState(opts.userId)
  if (daily.shownCount >= MAX_TESTIMONIALS_PER_DAY) return null

  const block = opts.namesBlocklist ?? new Set(daily.namesUsed)
  const tier = resolveTestimonialViewerTier(opts.viewerUsdAnchor ?? 0)
  const maxAttempts = 140
  let seed = Math.floor(rnd() * 0xffffffff)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    seed = (seed + attempt * 9973 + Math.floor(rnd() * 1e6)) >>> 0
    const r = mulberry32(seed)
    const fi = Math.floor(r() * FIRST_NAMES.length)
    const li = Math.floor(r() * LAST_INITIALS.length)
    const displayName = `${FIRST_NAMES[fi]} ${LAST_INITIALS[li]}.`
    if (block.has(displayName)) continue

    const ci = Math.floor(r() * TESTIMONIAL_COUNTRIES.length)
    const country = TESTIMONIAL_COUNTRIES[ci].country
    const periodRoll = r()
    const period: PeriodMonths = periodRoll < 0.38 ? 1 : periodRoll < 0.72 ? 3 : 6
    const usd = usdForStory(period, r, tier)
    if (amountTooSimilar(usd, daily.recentUsd)) continue

    const formatted = opts.formatUserMoney(usd)
    const ti = Math.floor(r() * 1_000_000)
    const emoji = EMOJI[Math.floor(r() * EMOJI.length)]
    const line = templateLine(ti, displayName, country, formatted, period, emoji)
    return { line, displayName, amountUsd: usd }
  }

  const r = rnd
  const displayName = `Member ${Math.floor(r() * 9000 + 1000)}`
  const country = TESTIMONIAL_COUNTRIES[Math.floor(r() * TESTIMONIAL_COUNTRIES.length)].country
  const period: PeriodMonths = 3
  const usd = usdForStory(period, r, tier)
  const formatted = opts.formatUserMoney(usd)
  const line = templateLine(Math.floor(r() * 11), displayName, country, formatted, period, EMOJI[0])
  return { line, displayName, amountUsd: usd }
}

export function testimonialCombinationLowerBound(): number {
  return FIRST_NAMES.length * LAST_INITIALS.length * TESTIMONIAL_COUNTRIES.length * 3 * 11
}

/**
 * Delay until next strip: ~28–65 min when quota remains; compress gently near end of day.
 */
export function nextTestimonialDelayMs(opts: {
  now?: Date
  minPerDay?: number
  shownToday: number
}): number {
  const now = opts.now ?? new Date()
  const minPerDay = opts.minPerDay ?? 6
  const need = Math.max(0, minPerDay - opts.shownToday)
  const msLeft = msUntilEndOfLocalDay(now)
  const softMin = 28 * 60 * 1000
  const softMax = 65 * 60 * 1000

  if (need <= 0 || opts.shownToday >= MAX_TESTIMONIALS_PER_DAY) {
    return softMin + Math.random() * (softMax - softMin)
  }

  const spread = msLeft / need
  if (spread >= softMax) {
    return softMin + Math.random() * (softMax - softMin)
  }

  const urgent = Math.max(20 * 60 * 1000, Math.min(softMax, spread * 0.88))
  return urgent * (0.92 + Math.random() * 0.16)
}

/** Cumulative visible dashboard time before recurring schedule starts (after welcome strip). */
export const TESTIMONIAL_VISIBILITY_GATE_MS = 14 * 60 * 1000
