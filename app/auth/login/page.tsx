import { headers } from "next/headers"
import LoginForm from "./login-form"
import { isAndroidUserAgent } from "@/lib/mobile/android-user-agent"
import { isInstallStaticBannerEnabled } from "@/lib/mobile/pwa-safe-mode"

export default async function LoginPage() {
  const ua = (await headers()).get("user-agent")
  const showAndroidInstallBanner =
    isInstallStaticBannerEnabled() && isAndroidUserAgent(ua)

  return <LoginForm showAndroidInstallBanner={showAndroidInstallBanner} />
}
