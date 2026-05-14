import { roundUsd2 } from "@/lib/nexus-financial-policy"

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function stringSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Random positive weights summing (after scaling) to `targetSum` exactly (2dp).
 * Used for copy 24h buckets and fixed-term daily profit curves.
 */
export function buildExactSumBuckets(seed: string, bucketCount: number, targetSum: number): number[] {
  const target = roundUsd2(targetSum)
  if (bucketCount <= 0 || !(target >= 0)) return []
  if (target === 0) return Array.from({ length: bucketCount }, () => 0)

  const rnd = mulberry32(stringSeed(seed))
  const weights: number[] = []
  let sumW = 0
  for (let i = 0; i < bucketCount; i++) {
    const w = 0.55 + rnd() * 0.9
    weights.push(w)
    sumW += w
  }
  const scale = target / sumW
  const buckets = weights.map((w) => Math.round(w * scale * 100) / 100)
  const drift = roundUsd2(target - buckets.reduce((a, b) => a + b, 0))
  if (buckets.length > 0) {
    buckets[buckets.length - 1] = roundUsd2(buckets[buckets.length - 1]! + drift)
  }
  return buckets
}

/** Cumulative sum of first `completedUnits` buckets (each unit = one bucket index). */
export function cumulativeBucketSum(buckets: readonly number[], completedUnits: number): number {
  const n = Math.max(0, Math.min(buckets.length, Math.floor(completedUnits)))
  let s = 0
  for (let i = 0; i < n; i++) s += buckets[i]!
  return roundUsd2(s)
}
