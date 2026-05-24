/**
 * Android install device detection regression checks (UA fixtures).
 * Run: npm run test:android-install-detection
 */
import { detectInstallSurfaceFromUa, isAndroidDevice, isDesktopLikeDevice, isIosDevice } from "@/lib/android-install/device-detection"
import { compareReleaseVersions } from "@/lib/android-install/config"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const androidChrome =
  "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
const androidSamsung =
  "Mozilla/5.0 (Linux; Android 12; SAMSUNG SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36"
const operaMini =
  "Opera/9.80 (Android; Opera Mini/36.0.2254/191.296; U; en) Presto/2.12.423 Version/12.16"
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const desktop =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function main() {
  assert(isAndroidDevice(androidChrome), "chrome android")
  assert(!isIosDevice(androidChrome), "not ios")
  assert(!isDesktopLikeDevice(androidChrome), "mobile android not desktop")

  const chromeSurface = detectInstallSurfaceFromUa(androidChrome)
  assert(chromeSurface.eligible === true, "chrome eligible")
  if (chromeSurface.eligible) {
    assert(chromeSurface.browser === "chrome", "chrome browser kind")
    assert(chromeSurface.supportsNativePwaPrompt, "chrome pwa")
  }

  const samsungSurface = detectInstallSurfaceFromUa(androidSamsung)
  assert(samsungSurface.eligible === true, "samsung eligible")

  const operaSurface = detectInstallSurfaceFromUa(operaMini)
  assert(operaSurface.eligible === true, "opera mini android")
  if (operaSurface.eligible) assert(operaSurface.needsManualInstructions, "opera manual")

  assert(detectInstallSurfaceFromUa(iphone).eligible === false, "iphone hidden")
  assert(detectInstallSurfaceFromUa(desktop).eligible === false, "desktop hidden")

  assert(compareReleaseVersions("20260525", "20260524") > 0, "version newer")
  assert(compareReleaseVersions("20260524", "20260524") === 0, "version equal")

  console.log("test-android-install-detection: OK")
}

main()
