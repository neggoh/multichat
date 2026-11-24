import type { Metadata, Viewport } from 'next'
import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const dynamic = 'force-dynamic'

const siteUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Chat Multi-IA — vários modelos de IA em uma só conversa',
  description:
    'Converse com dezenas de modelos gratuitos do OpenRouter em uma única interface. Troque de modelo no meio da conversa sem perder o contexto.',
  applicationName: 'Chat Multi-IA',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: ['/favicon.svg'],
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Chat Multi-IA',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: siteUrl,
    siteName: 'Chat Multi-IA',
    title: 'Chat Multi-IA — vários modelos de IA em uma só conversa',
    description:
      'Converse com dezenas de modelos gratuitos do OpenRouter em uma única interface e troque de modelo sem perder o contexto.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Chat Multi-IA' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chat Multi-IA',
    description: 'Vários modelos de IA em uma só conversa.',
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#0b0a14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
