/**
 * Canonical site / PWA branding — bump `assetVersion` when favicons or manifest change
 * so Android Chrome and desktop browsers pick up new tab icons.
 */
export const SITE_BRAND = {
  name: "Nexus Pro",
  shortName: "Nexus Pro",
  /** Cache-bust query for favicon, manifest, and OG assets */
  assetVersion: "20260609",
  themeColor: "#00b87c",
  backgroundColor: "#0d1117",
  siteUrl: "https://www.nexuspro.it.com",
} as const

export function brandAsset(path: string): string {
  const base = path.startsWith("/") ? path : `/${path}`
  return `${base}?v=${SITE_BRAND.assetVersion}`
}
