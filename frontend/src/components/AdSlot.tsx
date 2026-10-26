'use client'

import { useEffect, useRef, useState } from 'react'
import { ADSENSE_CLIENT } from '@/lib/site'
import { TCF_NONE, watchTcf, type TcfState } from '@/lib/tcf'

/**
 * Einzelner Anzeigenplatz. Rendert NUR, wenn
 *   1. die Seite Anzeigen erlaubt (`allowed` — siehe lib/adult.ts: kein Hentai,
 *      kein Ecchi/Nudity-Kontext) und
 *   2. das zertifizierte CMP die Einwilligung gemeldet hat (lib/tcf.ts).
 *
 * Der Platz ist als „Anzeige" beschriftet und hat eine feste Mindesthöhe, damit
 * kein Layout-Sprung entsteht (Core Web Vitals / Better Ads Standards).
 */
export function AdSlot({
  slot,
  allowed = true,
  format = 'auto',
  className = '',
  minHeight = 280,
}: {
  slot: string
  allowed?: boolean
  format?: string
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
        style={{ display: 'block', minHeight }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </aside>
  )
}
