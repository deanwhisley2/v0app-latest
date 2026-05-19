#!/usr/bin/env npx tsx
/**
 * Report UI keys missing from the French overlay (still fall back to English at runtime).
 * Usage: npx tsx scripts/i18n-fr-audit.ts
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = process.cwd()
const appSrc = readFileSync(resolve(root, "lib/i18n/app-messages.ts"), "utf8")
const frNotif = readFileSync(resolve(root, "lib/i18n/fr-notifications-overlay.ts"), "utf8")
const frFund = readFileSync(resolve(root, "lib/i18n/fr-funding-overlay.ts"), "utf8")
const fundingSrc = readFileSync(resolve(root, "lib/i18n/funding-withdrawal-copy.ts"), "utf8")

function keysFrom(block: string): Set<string> {
  const s = new Set<string>()
  const re = /"([a-z0-9_.]+)":/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) s.add(m[1])
  return s
}

const enBlock = appSrc.split("const en:")[1].split("const fr:")[0]
const frManual = appSrc.split("const fr:")[1].split("const sw:")[0]
const frFw = fundingSrc.split("const frFw")[1].split("const swFw")[0]

const en = keysFrom(enBlock)
const fr = new Set([...keysFrom(frManual), ...keysFrom(frNotif), ...keysFrom(frFund), ...keysFrom(frFw)])

const missing = [...en].filter((k) => !fr.has(k)).sort()
console.log(`English keys: ${en.size}`)
console.log(`French overlay keys: ${fr.size}`)
console.log(`Missing French: ${missing.length}`)
if (missing.length) {
  console.log("\nFirst 40 missing:")
  for (const k of missing.slice(0, 40)) console.log(`  - ${k}`)
}
