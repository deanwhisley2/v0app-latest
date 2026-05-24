import { headers } from "next/headers"
import RegisterForm from "./register-form"
import { isAndroidUserAgent } from "@/lib/mobile/android-user-agent"
import { isInstallStaticBannerEnabled } from "@/lib/mobile/pwa-safe-mode"

export default async function RegisterPage() {
  const ua = (await headers()).get("user-agent")
  const showAndroidInstallBanner =
    isInstallStaticBannerEnabled() && isAndroidUserAgent(ua)

  return <RegisterForm showAndroidInstallBanner={showAndroidInstallBanner} />
}
