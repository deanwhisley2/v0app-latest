#!/usr/bin/env npx tsx
/**
 * One-off generator: lib/i18n/fr-funding-overlay.ts from English funding keys.
 * Re-run when fundingWithdrawalEn grows: npx tsx scripts/generate-fr-funding-overlay.ts
 */
import { writeFileSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fundingWithdrawalEn } from "../lib/i18n/funding-withdrawal-copy"
import { frNotificationsOverlay } from "../lib/i18n/fr-notifications-overlay"

const PHRASES: [string, string][] = [
  ["Add Funds", "Ajouter des fonds"],
  ["Withdraw Funds", "Retrait de fonds"],
  ["Withdraw", "Retirer"],
  ["Withdrawal", "Retrait"],
  ["Funding", "Financement"],
  ["Payment", "Paiement"],
  ["Processing…", "Traitement…"],
  ["Processing", "Traitement"],
  ["Required", "obligatoire"],
  ["required", "obligatoire"],
  ["Enter ", "Saisissez "],
  ["Select ", "Sélectionnez "],
  ["Confirm ", "Confirmez "],
  ["Complete ", "Terminez "],
  ["Open ", "Ouvrez "],
  ["Copy ", "Copiez "],
  ["Paste ", "Collez "],
  ["Upload ", "Téléversez "],
  ["Contact support", "Contactez l’assistance"],
  ["Session expired", "Session expirée"],
  ["Insufficient balance", "Solde insuffisant"],
  ["Available:", "Disponible :"],
  ["Verified", "Vérifié"],
  ["Pending", "En attente"],
  ["Failed", "Échoué"],
  ["Approved", "Approuvé"],
  ["Rejected", "Refusé"],
  ["Under review", "En cours d’examen"],
  ["Confirm Payment", "Confirmer le paiement"],
  ["Close", "Fermer"],
  ["Continue", "Continuer"],
  ["Back", "Retour"],
  ["Step ", "Étape "],
  [" of 2", " sur 2"],
  ["Country", "Pays"],
  ["Network", "Réseau"],
  ["Amount", "Montant"],
  ["balance", "solde"],
  ["account", "compte"],
  ["desk", "guichet"],
  ["retailer", "guichet"],
  ["Official", "Officiel"],
  ["company", "société"],
  ["Crypto", "Crypto"],
  ["mobile money", "mobile money"],
  ["transaction", "transaction"],
  ["reference", "référence"],
  ["receipt", "reçu"],
  ["screenshot", "capture d’écran"],
  ["Notifications", "Notifications"],
  ["Nexus Main", "Nexus Main"],
  ["Container", "Conteneur"],
  ["Bullish Trades", "Trades haussiers"],
  ["Good morning", "Bonjour"],
  ["Good afternoon", "Bon après-midi"],
  ["Good evening", "Bonsoir"],
  ["Member workspace", "Espace membre"],
  ["Workspace guide", "Guide de l’espace"],
  ["overview", "aperçu"],
  ["Fund your account", "Financez votre compte"],
  ["Add funds", "Ajouter des fonds"],
  ["Exchange", "Échange"],
  ["connection", "connexion"],
  ["Manage", "Gérer"],
  ["Open", "Ouvrir"],
  ["Minimum:", "Minimum :"],
  ["Maximum", "Maximum"],
  ["hours", "heures"],
  ["One withdrawal per 24 hours", "Un retrait par 24 heures"],
  ["Could not", "Impossible de"],
  ["not found", "introuvable"],
  ["invalid", "invalide"],
  ["unavailable", "indisponible"],
]

function toFrench(en: string): string {
  let s = en
  for (const [from, to] of PHRASES) {
    if (s.includes(from)) s = s.split(from).join(to)
  }
  return s
}

const existingFr = new Set([
  ...Object.keys(frNotificationsOverlay),
])

const lines: string[] = [
  "/** Auto-generated French funding/home keys — run scripts/generate-fr-funding-overlay.ts */",
  "export const frFundingOverlay: Record<string, string> = {",
]

for (const [key, en] of Object.entries(fundingWithdrawalEn)) {
  if (existingFr.has(key)) continue
  const fr = toFrench(en).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  lines.push(`  "${key}": "${fr}",`)
}

lines.push("}")
lines.push("")

const out = resolve(process.cwd(), "lib/i18n/fr-funding-overlay.ts")
writeFileSync(out, lines.join("\n"))
console.log("Wrote", out, "keys:", lines.length - 3)
