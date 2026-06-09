import type { CapacitorConfig } from "@capacitor/cli"

/**
 * Thin WebView wrapper — loads production dashboard remotely for a sub-5MB APK.
 * `webDir` holds launcher shell assets synced by `npx cap sync`; live UI comes from server.url.
 */
const config: CapacitorConfig = {
  appId: "com.nexuspro.it.app",
  appName: "Nexus Pro",
  webDir: "out",
  server: {
    url: "https://nexuspro.it.com",
    androidScheme: "https",
    allowNavigation: ["nexuspro.it.com", "*.supabase.co", "*.supabase.in"],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
}

export default config
