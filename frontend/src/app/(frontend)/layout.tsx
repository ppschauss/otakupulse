import React from 'react'
import type { Metadata } from 'next'
import './styles.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { JsonLd } from '@/components/JsonLd'
import { Analytics } from '@/components/Analytics'
import { CookieConsent } from '@/components/CookieConsent'
import { organizationLd } from '@/lib/seo'
import { getNavigation } from '@/lib/navigation'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site'

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION

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
  alternates: {
    types: { 'application/rss+xml': [{ url: '/feed.xml', title: `${SITE_NAME} — News` }] },
  },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const nav = await getNavigation()
  return (
    <html lang="de">
      <body className="min-h-screen bg-zinc-950 text-zinc-200 antialiased">
        <Header nav={nav.header} />
        {children}
        <Footer columns={nav.footerColumns} legal={nav.legal} />
        <JsonLd data={organizationLd()} />
        <Analytics />
        <CookieConsent />
      </body>
    </html>
  )
}
