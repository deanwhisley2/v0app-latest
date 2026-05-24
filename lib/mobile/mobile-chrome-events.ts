/** Cross-component mobile chrome events (search, profile, header reveal). */

export const NEXUS_OPEN_SEARCH = "nexus:open-search"
export const NEXUS_OPEN_PROFILE = "nexus:open-profile"
export const NEXUS_HEADER_REVEAL = "nexus:header-reveal"
export const NEXUS_NETWORK_RECONNECTED = "nexus:network-reconnected"

export function dispatchMobileChromeEvent(name: string): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(name))
}

export function openMobileSearch(): void {
  dispatchMobileChromeEvent(NEXUS_OPEN_SEARCH)
}

export function openMobileProfile(): void {
  dispatchMobileChromeEvent(NEXUS_OPEN_PROFILE)
}

export function revealMobileHeader(): void {
  dispatchMobileChromeEvent(NEXUS_HEADER_REVEAL)
}
