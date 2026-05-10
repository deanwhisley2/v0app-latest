/**
 * Procedural Container Mode “social proof” lines. Combinatorics (names × countries ×
 * periods × templates × amount buckets) yield well over 2,000 unique stories; we avoid
 * repeating the same display name (e.g. "Grace W.") on the same local calendar day.
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
  "James",
  "Samuel",
  "Musa",
  "Zainab",
  "Esther",
  "Abdul",
  "David",
  "Sarah",
  "Amina",
  "Aisha",
  "Grace",
  "Kwame",
  "Nkechi",
  "Kofi",
  "Yaa",
  "Emmanuel",
  "Chioma",
  "Ibrahim",
  "Fatima",
  "Peter",
  "John",
  "Mary",
  "Joseph",
  "Ruth",
  "Daniel",
  "Hannah",
  "Michael",
  "Elizabeth",
  "Paul",
  "Lucy",
  "Simon",
  "Martha",
  "Andrew",
  "Rebecca",
  "Thomas",
  "Catherine",
  "Mark",
  "Janet",
  "Stephen",
  "Joyce",
  "Samuel",
  "Cecilia",
  "Benjamin",
  "Patience",
  "Joshua",
  "Mercy",
  "Isaac",
  "Priscilla",
  "Jonathan",
  "Tabitha",
  "Caleb",
  "Beatrice",
  "Nathan",
  "Dorothy",
  "Aaron",
  "Florence",
  "Gideon",
  "Victoria",
  "Timothy",
  "Rachel",
  "Noah",
  "Naomi",
  "Jacob",
  "Deborah",
  "Moses",
  "Anna",
  "Solomon",
  "Martha",
  "Elias",
  "Lydia",
  "Gabriel",
  "Sariah",
  "Elijah",
  "Halima",
  "Enoch",
  "Zara",
  "Barak",
  "Amina",
  "Nadia",
  "Omar",
  "Leila",
  "Tariq",
  "Yusuf",
  "Aaliyah",
  "Malik",
  "Imani",
]

const LAST_INITIALS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("")

export type DailyTestimonialState = {
  day: string
  namesUsed: string[]
  shownCount: number
}

const STORAGE_PREFIX = "nexus_testimonial_daily_v1"

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
    return { day: "", namesUsed: [], shownCount: 0 }
  }
  const today = localDayString(new Date())
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return { day: today, namesUsed: [], shownCount: 0 }
    const j = JSON.parse(raw) as Partial<DailyTestimonialState>
    if (j.day !== today) return { day: today, namesUsed: [], shownCount: 0 }
    return {
      day: today,
      namesUsed: Array.isArray(j.namesUsed) ? j.namesUsed : [],
      shownCount: typeof j.shownCount === "number" ? j.shownCount : 0,
    }
  } catch {
    return { day: today, namesUsed: [], shownCount: 0 }
  }
}

export function recordTestimonialShown(displayName: string, userId?: string | null): DailyTestimonialState {
  if (typeof window === "undefined") {
    return { day: "", namesUsed: [], shownCount: 0 }
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
  const next: DailyTestimonialState = { day: today, namesUsed, shownCount }
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
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

/** Conservative headline amounts so “live activity” feels plausible, not lottery-sized. */
function usdForStory(period: PeriodMonths, rnd: () => number): number {
  const r = rnd()
  if (period === 1) return Math.round(35 + r * 920)
  if (period === 3) return Math.round(180 + r * 5_200)
  return Math.round(520 + r * 14_800)
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
  /** If omitted, uses Math.random */
  random?: () => number
  namesBlocklist?: Set<string>
}

/**
 * Returns a testimonial line in the viewer’s display currency (via formatUserMoney),
 * while keeping “from Kenya” etc. for regional flavor.
 */
export function pickContainerTestimonialLine(opts: PickTestimonialOpts): {
  line: string
  displayName: string
} | null {
  const rnd = opts.random ?? Math.random
  const block =
    opts.namesBlocklist ?? new Set(readDailyTestimonialState(opts.userId).namesUsed)
  const maxAttempts = 120
  let seed = Math.floor(rnd() * 0xffffffff)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    seed = (seed + attempt * 9973) >>> 0
    const r = mulberry32(seed)
    const fi = Math.floor(r() * FIRST_NAMES.length)
    const li = Math.floor(r() * LAST_INITIALS.length)
    const displayName = `${FIRST_NAMES[fi]} ${LAST_INITIALS[li]}.`
    if (block.has(displayName)) continue

    const ci = Math.floor(r() * TESTIMONIAL_COUNTRIES.length)
    const country = TESTIMONIAL_COUNTRIES[ci].country
    const periodRoll = r()
    const period: PeriodMonths = periodRoll < 0.38 ? 1 : periodRoll < 0.72 ? 3 : 6
    const usd = usdForStory(period, r)
    const formatted = opts.formatUserMoney(usd)
    const ti = Math.floor(r() * 1_000_000)
    const emoji = EMOJI[Math.floor(r() * EMOJI.length)]
    const line = templateLine(ti, displayName, country, formatted, period, emoji)
    return { line, displayName }
  }

  const r = rnd
  const displayName = `Member ${Math.floor(r() * 9000 + 1000)}`
  const country = TESTIMONIAL_COUNTRIES[Math.floor(r() * TESTIMONIAL_COUNTRIES.length)].country
  const period: PeriodMonths = 3
  const formatted = opts.formatUserMoney(usdForStory(period, r))
  const line = templateLine(Math.floor(r() * 11), displayName, country, formatted, period, EMOJI[0])
  return { line, displayName }
}

/** Combinatorial capacity (lower bound) for unique stories from name × geo × period × template buckets. */
export function testimonialCombinationLowerBound(): number {
  return FIRST_NAMES.length * LAST_INITIALS.length * TESTIMONIAL_COUNTRIES.length * 3 * 11
}

/**
 * Schedule next notification delay: prefer 40–90 min; compress toward end of local day
 * if fewer than `minPerDay` have been shown.
 */
export function nextTestimonialDelayMs(opts: {
  now?: Date
  minPerDay?: number
  shownToday: number
}): number {
  const now = opts.now ?? new Date()
  const minPerDay = opts.minPerDay ?? 10
  const need = Math.max(0, minPerDay - opts.shownToday)
  const msLeft = msUntilEndOfLocalDay(now)
  const softMin = 40 * 60 * 1000
  const softMax = 90 * 60 * 1000

  if (need <= 0) {
    return softMin + Math.random() * (softMax - softMin)
  }

  const spread = msLeft / need
  if (spread >= softMax) {
    return softMin + Math.random() * (softMax - softMin)
  }

  const urgent = Math.max(22 * 60 * 1000, Math.min(softMax, spread * 0.92))
  return urgent
}
