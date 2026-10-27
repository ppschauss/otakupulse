'use client'

import { useEffect, useRef, useState } from 'react'
import { ADSENSE_CLIENT, ADSENSE_SLOTS } from '@/lib/site'
import { TCF_NONE, watchTcf, type TcfState } from '@/lib/tcf'

/**
 * Einzelner Anzeigenplatz. Rendert NUR, wenn
 *   1. die Seite Anzeigen erlaubt (`allowed` — siehe lib/adult.ts: kein Hentai,
 *      kein Ecchi/Nudity-Kontext) und
 *   2. das zertifizierte CMP die Einwilligung gemeldet hat (lib/tcf.ts).
 *
 * Der Platz ist als „Anzeige" beschriftet und hat eine feste Mindesthöhe, damit
 * kein Layout-Sprung entsteht (Core Web Vitals / Better Ads Standards).
 *
 * Für die drei im Konto angelegten Blöcke gibt es fertige Wrapper am Dateiende
 * (AdBanner / AdInArticle / AdMultiplex) — Aufrufstellen nutzen die, nicht AdSlot
 * direkt, damit Format und Slot-ID nicht auseinanderlaufen.
 */
export function AdSlot({
  slot,
  allowed = true,
  format = 'auto',
  layout,
  fullWidthResponsive = true,
  centered = false,
  className = '',
  minHeight = 280,
}: {
  slot: string
  allowed?: boolean
  format?: string
  /** data-ad-layout, z. B. „in-article" für den nativen Fließtext-Block. */
  layout?: string
  /** Nur für Display-Blöcke sinnvoll; fluid/autorelaxed skalieren selbst. */
  fullWidthResponsive?: boolean
  centered?: boolean
  className?: string
  minHeight?: number
}) {
  const [tcf, setTcf] = useState<TcfState>(TCF_NONE)
  const ref = useRef<HTMLModElement>(null)
  const pushed = useRef(false)

  useEffect(() => watchTcf(setTcf), [])

  const show = allowed && !!ADSENSE_CLIENT && tcf.ready && tcf.storage && tcf.googleVendor

  useEffect(() => {
    if (!show || pushed.current || !ref.current) return
    try {
      ;((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({})
      pushed.current = true
    } catch {
      /* Skript noch nicht da — der nächste Render versucht es erneut. */
    }
  }, [show])

  if (!show) return null

  return (
    <aside className={`my-8 ${className}`} aria-label="Anzeige">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-600">Anzeige</p>
      <ins
        ref={ref}
        className="adsbygoogle block"
        style={{ display: 'block', minHeight, ...(centered ? { textAlign: 'center' as const } : {}) }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        {...(layout ? { 'data-ad-layout': layout } : {})}
        {...(fullWidthResponsive ? { 'data-full-width-responsive': 'true' } : {})}
      />
    </aside>
  )
}

type PresetProps = { allowed?: boolean; className?: string }

/** Responsives Display-Banner — passt in Listen- und Übersichtsseiten. */
export function AdBanner(props: PresetProps) {
  return <AdSlot slot={ADSENSE_SLOTS.banner} format="auto" minHeight={280} {...props} />
}

/**
 * Natives In-Article — gehört zwischen Fließtext, nicht in die Seitenleiste
 * (Google: „Platzieren Sie die Anzeige auf Seiten mit Text … nicht in der
 * Seitenleiste, da sich dies negativ auf die Leistung auswirken kann").
 */
export function AdInArticle(props: PresetProps) {
  return (
    <AdSlot
      slot={ADSENSE_SLOTS.inArticle}
      format="fluid"
      layout="in-article"
      fullWidthResponsive={false}
      centered
      minHeight={250}
      {...props}
    />
  )
}

/** „Verwandte Inhalte" (Multiplex) — ans Seitenende, unter den echten Content. */
export function AdMultiplex(props: PresetProps) {
  return (
    <AdSlot
      slot={ADSENSE_SLOTS.multiplex}
      format="autorelaxed"
      fullWidthResponsive={false}
      minHeight={320}
      {...props}
    />
  )
}
