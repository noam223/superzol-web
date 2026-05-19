import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import NavbarWrapper from '@/components/NavbarWrapper'
import LocationPrompt from '@/components/LocationPrompt'

export const metadata: Metadata = {
  title: 'סופרזול - השוואת מחירים בסופרמרקטים',
  description: 'השווה מחירים בין רשתות הסופרמרקטים הגדולות בישראל',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/logo.png',
    apple: '/icons/logo.png',
    shortcut: '/icons/logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'סופרזול',
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              fontFamily: 'Heebo, sans-serif',
              direction: 'rtl',
              background: '#E9D8C5',
              color: '#4F483F',
              border: '1px solid #B6AB9C',
            },
          }}
        />
        {children}
        <NavbarWrapper />
        <LocationPrompt />
      </body>
    </html>
  )
}
