import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { isSupportedOperatingCountry } from "@/lib/operating-countries"
import { enforceCountryCorridor } from "@/lib/server/country-corridor-guard"

/** Pre-flight: does request IP match selected operating country? */
export async function GET(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  const url = new URL(request.url)
  const country = url.searchParams.get("country")?.trim().toUpperCase().slice(0, 2) ?? ""
  if (!isSupportedOperatingCountry(country)) {
    return NextResponse.json({ ok: false, error: "Unsupported country code." }, { status: 400 })
  }

  const result = await enforceCountryCorridor(request, country)
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      allowed: false,
      selectedCountry: result.selectedCountry,
      detectedCountry: result.detectedCountry,
      error: result.message,
    })
  }

  return NextResponse.json({
    ok: true,
    allowed: true,
    selectedCountry: result.selectedCountry,
    detectedCountry: result.detectedCountry,
    bypassed: result.bypassed,
    geoUncertain: result.geoUncertain ?? false,
    warning: result.warning ?? null,
  })
}
