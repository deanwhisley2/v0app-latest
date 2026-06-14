import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.nexuspro.it.app",
  appName: "Nexus Pro",
  webDir: "out",
  server: {
    url: "https://nexuspro-it-com.com",
    androidScheme: "https",
    cleartext: true,
    allowNavigation: [
      "nexuspro-it-com.com",
      "*.nexuspro-it-com.com",
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
