/** @type {import('next').NextConfig} */
const extraDevOrigins =
  process.env.NEXT_PUBLIC_DEV_EXTRA_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []

/**
 * Hostnames allowed to load Turbopack / `/_next` dev assets (Origin / Referer check).
 * Next always allows `localhost` + `*.localhost`; add IPv4/IPv6 loopback and any LAN host you open in the browser.
 */
const nextConfig = {
  typescript: {
    // Default: tolerate TS errors during `next build` (legacy escape hatch).
    // Set NEXT_IGNORE_BUILD_TS=0 (see `npm run build:strict` / `verify:ci`) to enforce Next's type pass.
    // Phase C: replace this with `ignoreBuildErrors: false` when production parity is proven stable.
    ignoreBuildErrors: process.env.NEXT_IGNORE_BUILD_TS !== "0",
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
    proxyClientMaxBodySize: 8 * 1024 * 1024,
  },
  images: {
    unoptimized: true,
  },
  /**
   * Dev-only: browser host must be listed or Turbopack blocks `/_next/*` → "Failed to fetch".
   * Use http://localhost:PORT (not 127.0.0.1) if you still see errors, or add your LAN IP below / in .env:
   * NEXT_PUBLIC_DEV_EXTRA_ORIGINS=192.168.1.10,10.0.0.5
   */
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "::1",
    "[::1]",
    "*.local",
    ...extraDevOrigins,
  ],
  async headers() {
    return [
      {
        source: "/app-debug.apk",
        headers: [
          {
            key: "Content-Type",
            value: "application/vnd.android.package-archive",
          },
          {
            key: "Content-Disposition",
            value: 'attachment; filename="Nexus_Pro.apk"',
          },
          {
            key: "Cache-Control",
            value: "public, max-age=3600",
          },
        ],
      },
    ]
  },
}

export default nextConfig
