import React from 'react'
import type { Metadata } from 'next'
import './styles.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { JsonLd } from '@/components/JsonLd'
import { organizationLd } from '@/lib/seo'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'OtakuPulse — Anime-Datenbank & News',
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    siteName: SITE_NAME,
    type: 'website',
    locale: 'de_DE',
  },
  twitter: { card: 'summary_large_image' },
}

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-zinc-950 text-zinc-200 antialiased">
        <Header />
        {children}
        <Footer />
        <JsonLd data={organizationLd()} />
      </body>
    </html>
  )
}
