import type { CapacitorConfig } from "@capacitor/cli"

/**
 * Thin WebView shell — loads live dashboard inside BridgeActivity (no external browser).
 * `webDir` is a minimal offline fallback; `server.url` is the authoritative boot target.
 */
const config: CapacitorConfig = {
  appId: "com.nexuspro.it.app",
  appName: "Nexus Pro",
  webDir: "out",
  server: {
    url: "https://www.nexuspro.it.com/dashboard?source=capacitor_apk",
    androidScheme: "https",
    cleartext: true,
    allowNavigation: [
      "nexuspro.it.com",
      "www.nexuspro.it.com",
      "*.nexuspro.it.com",
      "*.supabase.co",
      "*.supabase.in",
    ],
  },
  plugins: {
    CapacitorCookies: { enabled: true },
    CapacitorHttp: { enabled: true },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    appendUserAgent: "NexusProApp",
  },
}

export default config
