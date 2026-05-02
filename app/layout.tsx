import type { Metadata } from 'next'
import { Inter, Space_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/contexts/AuthContext'
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

export const metadata: Metadata = {
  title: 'Nexus Pro - Crypto Trading Dashboard',
  description: 'Professional crypto trading dashboard with AI-powered analysis, real-time market data, and automated trading strategies.',
  generator: 'v0.app',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
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
    <html lang="en" className="dark bg-background">
      <body
        className={`${inter.variable} ${spaceMono.variable} font-sans antialiased bg-background`}
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
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="top-center" toastOptions={{ duration: 4500 }} />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
