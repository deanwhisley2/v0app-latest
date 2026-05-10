import type { Metadata, Viewport } from 'next'
import { Inter, Space_Mono } from 'next/font/google'
import { AuthProvider } from '@/contexts/AuthContext'
import { OperationalBootstrapProvider } from '@/contexts/OperationalBootstrapContext'
import { NexusNotificationsProvider } from '@/contexts/NexusNotificationsContext'
import { UserPreferencesProvider } from '@/contexts/UserPreferencesContext'
import { Toaster } from 'react-hot-toast'
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
}

export const metadata: Metadata = {
  title: 'Nexus Pro - Crypto Trading Dashboard',
  description: 'Professional crypto trading dashboard with Joelin-guided analysis, real-time market data, and automated trading strategies.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-background" style={{ backgroundColor: "#070a12", color: "#e8edf5" }}>
      <body
        className={`${inter.variable} ${spaceMono.variable} font-sans antialiased bg-background`}
        style={{ backgroundColor: "#070a12", color: "#e8edf5", minHeight: "100%" }}
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
        <div id="nexus-app-root">
          <AuthProvider>
            <OperationalBootstrapProvider>
              <NexusNotificationsProvider>
                <UserPreferencesProvider>{children}</UserPreferencesProvider>
              </NexusNotificationsProvider>
            </OperationalBootstrapProvider>
          </AuthProvider>
        </div>
        <Toaster position="top-center" toastOptions={{ duration: 4500 }} />
      </body>
    </html>
  )
}
