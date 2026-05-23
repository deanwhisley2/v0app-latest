import type { Metadata, Viewport } from 'next'
import { Inter, Space_Mono } from 'next/font/google'
import { AuthProvider } from '@/contexts/AuthContext'
import { OperationalBootstrapProvider } from '@/contexts/OperationalBootstrapContext'
import { NexusNotificationsProvider } from '@/contexts/NexusNotificationsContext'
import { UserPreferencesProvider } from '@/contexts/UserPreferencesContext'
import { brandAsset, SITE_BRAND } from '@/lib/site-branding'
import {
  GoogleAnalyticsRouteTracker,
  GoogleAnalyticsScripts,
} from '@/components/analytics/google-analytics'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeScript } from '@/components/theme-script'
import { NEXUS_THEME_STORAGE_KEY } from '@/lib/nexus-theme-storage'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: SITE_BRAND.themeColor,
  interactiveWidget: 'resizes-content',
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_BRAND.siteUrl),
  title: {
    default: SITE_BRAND.name,
    template: `%s | ${SITE_BRAND.name}`,
  },
  description:
    'Nexus Pro — institutional multi-asset trading workspace with funding controls, market continuity, and mobile-first operations.',
  applicationName: SITE_BRAND.name,
  manifest: brandAsset('/manifest.webmanifest'),
  appleWebApp: {
    capable: true,
    title: SITE_BRAND.name,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: brandAsset('/favicon.ico'), sizes: 'any' },
      { url: brandAsset('/brand/icons/icon-32.png'), sizes: '32x32', type: 'image/png' },
      { url: brandAsset('/brand/icons/icon-64.png'), sizes: '64x64', type: 'image/png' },
      { url: brandAsset('/icon.svg'), type: 'image/svg+xml' },
    ],
    apple: [
      {
        url: brandAsset('/brand/icons/apple-touch-icon.png'),
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcut: brandAsset('/favicon.ico'),
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_BRAND.siteUrl,
    siteName: SITE_BRAND.name,
    title: SITE_BRAND.name,
    description:
      'Institutional multi-asset trading workspace — funding, markets, and operational controls.',
    images: [
      {
        url: brandAsset('/brand/og-image.png'),
        width: 1200,
        height: 630,
        alt: `${SITE_BRAND.name} logo`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_BRAND.name,
    description:
      'Institutional multi-asset trading workspace — funding, markets, and operational controls.',
    images: [brandAsset('/brand/og-image.png')],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-title': SITE_BRAND.name,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${inter.variable} ${spaceMono.variable} font-sans antialiased bg-background text-foreground min-h-full`}
        suppressHydrationWarning
      >
        {/* Prevent browser extension errors from wallet injectors */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (typeof window !== 'undefined' && !window.ethereum) {
                  Object.defineProperty(window, 'ethereum', {
                    value: {},
                    writable: true,
                    configurable: true
                  });
                }
              } catch(e) {}
            `,
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          storageKey={NEXUS_THEME_STORAGE_KEY}
          disableTransitionOnChange
        >
          <div id="nexus-app-root">
            <AuthProvider>
              <OperationalBootstrapProvider>
                <NexusNotificationsProvider>
                  <UserPreferencesProvider>{children}</UserPreferencesProvider>
                </NexusNotificationsProvider>
              </OperationalBootstrapProvider>
            </AuthProvider>
          </div>
        </ThemeProvider>
        <GoogleAnalyticsScripts />
        <GoogleAnalyticsRouteTracker />
        <Toaster position="top-center" toastOptions={{ duration: 4500 }} />
      </body>
    </html>
  )
}
