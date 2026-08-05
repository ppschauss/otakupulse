'use client'

import { useEffect, useState } from 'react'

/**
 * Teilen-Leiste für Beiträge: nativer Web-Share-Dialog (mobil, wenn verfügbar)
 * + „Link kopieren" + die wichtigsten Netzwerke (WhatsApp, Telegram, X, Bluesky,
 * Facebook, Reddit). `url` sollte absolut sein (Server übergibt die kanonische URL).
 */
export function ShareButtons({ url, title, message }: { url: string; title: string; message?: string }) {
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  // navigator.share existiert nur clientseitig (v. a. mobil) → erst nach Mount prüfen.
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  // `message` = CTA-Vorlage für die konversationellen Kanäle (WhatsApp/Telegram/X/
  // Bluesky/nativer Dialog). Reddit nutzt den nackten Titel als Beitrags-Titel.
  const msg = message || title
  // Text zuerst, Link danach — für Kanäle mit freiem Nachrichtentext (WhatsApp,
  // Bluesky, nativer Dialog). Telegram/X bekommen Text + URL getrennt und hängen
  // den Link von sich aus hinten an (kein doppelter Link).
  const shareText = `${msg}\n\n${url}`
  const u = encodeURIComponent(url)
  const t = encodeURIComponent(msg)
  const rt = encodeURIComponent(title)
  const tu = encodeURIComponent(shareText)

  const links: { name: string; href: string; icon: React.ReactNode; hover: string }[] = [
    {
      name: 'WhatsApp',
      href: `https://wa.me/?text=${tu}`,
      hover: 'hover:border-[#25D366]/60 hover:text-[#25D366]',
      icon: (
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.35-.5.05-.95.23-3.2-.67-2.7-1.06-4.42-3.8-4.55-3.98-.13-.18-1.1-1.46-1.1-2.78 0-1.33.7-1.98.94-2.25.24-.27.53-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.23.53.77 1.86.84 2 .07.13.11.29.02.47-.09.18-.13.29-.27.44-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.16.27.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.35-.22.6-.13.24.09 1.55.73 1.82.86.27.13.44.2.5.31.07.11.07.63-.16 1.31Z" />
      ),
    },
    {
      name: 'Telegram',
      // Telegram BRAUCHT ein gefülltes `url`-Feld, sonst öffnet der Link nur
      // telegram.org statt des Share-Sheets. Der Endpoint stellt die URL dann
      // technisch bedingt vor den Text — Text-vor-Link ist hier nicht möglich.
      // `t` = CTA (ohne URL), damit der Link nicht doppelt erscheint.
      href: `https://t.me/share/url?url=${u}&text=${t}`,
      hover: 'hover:border-[#229ED9]/60 hover:text-[#229ED9]',
      icon: (
        <path d="M21.94 4.9 18.9 19.2c-.23 1-.83 1.26-1.68.78l-4.64-3.42-2.24 2.16c-.25.25-.46.46-.94.46l.33-4.73 8.6-7.77c.37-.33-.08-.52-.58-.19L7.13 13.4l-4.57-1.43c-1-.31-1.01-1 .21-1.48l17.86-6.88c.83-.31 1.55.19 1.31 1.28Z" />
      ),
    },
    {
      name: 'X',
      href: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
      hover: 'hover:border-white/60 hover:text-white',
      icon: (
        <path d="M17.53 3H20.5l-6.48 7.41L21.75 21h-5.98l-4.68-6.12L5.7 21H2.72l6.94-7.93L2.25 3h6.13l4.23 5.6L17.53 3Zm-1.05 16.2h1.65L7.6 4.7H5.83l10.65 14.5Z" />
      ),
    },
    {
      name: 'Bluesky',
      href: `https://bsky.app/intent/compose?text=${tu}`,
      hover: 'hover:border-[#1185FE]/60 hover:text-[#1185FE]',
      icon: (
        <path d="M12 10.8c-.9-1.75-3.35-5.02-5.63-6.62C4.19 2.65 3.36 2.9 2.81 3.15 2.18 3.44 2 4.4 2 4.97c0 .58.32 4.74.53 5.44.68 2.3 3.1 3.08 5.34 2.83-3.28.49-6.2 1.68-2.37 5.95 4.2 4.35 5.76-.93 6.5-3.6.74 2.67 1.66 7.76 6.26 3.6 3.58-3.6.94-5.46-2.34-5.95 2.23.25 4.65-.53 5.33-2.83.21-.7.53-4.86.53-5.44 0-.58-.18-1.53-.81-1.82-.55-.25-1.38-.5-3.56 1.03C15.35 5.78 12.9 9.05 12 10.8Z" />
      ),
    },
    {
      name: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      hover: 'hover:border-[#1877F2]/60 hover:text-[#1877F2]',
      icon: (
        <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.9h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
      ),
    },
    {
      name: 'Reddit',
      href: `https://www.reddit.com/submit?url=${u}&title=${rt}`,
      hover: 'hover:border-[#FF4500]/60 hover:text-[#FF4500]',
      icon: (
        <path d="M22 11.82a2.13 2.13 0 0 0-3.6-1.53 10.4 10.4 0 0 0-5.6-1.77l.95-4.48 3.12.66a1.53 1.53 0 1 0 .16-.9l-3.48-.74a.38.38 0 0 0-.45.29l-1.06 4.99a10.5 10.5 0 0 0-5.68 1.77 2.13 2.13 0 1 0-2.35 3.5 4.2 4.2 0 0 0-.05.64c0 3.24 3.77 5.86 8.42 5.86s8.42-2.62 8.42-5.86a4.2 4.2 0 0 0-.05-.63A2.13 2.13 0 0 0 22 11.82ZM7.6 13.34a1.53 1.53 0 1 1 3.06 0 1.53 1.53 0 0 1-3.06 0Zm8.53 4.03c-1.04 1.04-3.05 1.12-3.64 1.12-.59 0-2.6-.08-3.64-1.12a.4.4 0 0 1 .56-.56c.66.66 2.06.89 3.08.89 1.02 0 2.42-.23 3.08-.89a.4.4 0 0 1 .56.56Zm-.28-2.5a1.53 1.53 0 1 1 0-3.06 1.53 1.53 0 0 1 0 3.06Z" />
      ),
    },
  ]

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-300 transition'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Teilen</span>

      {canNativeShare ? (
        <button
          type="button"
          onClick={() => navigator.share({ title, text: shareText }).catch(() => {})}
          className={`${btn} hover:border-accent/60 hover:text-white`}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M18 16.08a2.9 2.9 0 0 0-1.96.77l-7.13-4.15c.05-.23.09-.46.09-.7 0-.24-.04-.47-.09-.7l7.05-4.11c.37.34.85.55 1.38.55a2.92 2.92 0 1 0-2.92-2.92c0 .24.04.47.09.7L7.53 8.9a2.92 2.92 0 1 0 0 4.2l7.12 4.16c-.05.21-.08.43-.08.65a2.85 2.85 0 1 0 2.85-2.83Z" />
          </svg>
          Teilen
        </button>
      ) : null}

      {links.map((l) => (
        <a
          key={l.name}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={`Auf ${l.name} teilen`}
          className={`${btn} ${l.hover}`}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            {l.icon}
          </svg>
          <span className="hidden sm:inline">{l.name}</span>
        </a>
      ))}

      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            /* clipboard nicht verfügbar — ignorieren */
          }
        }}
        className={`${btn} hover:border-accent/60 hover:text-white`}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z" />
        </svg>
        {copied ? 'Kopiert ✓' : 'Link kopieren'}
      </button>
    </div>
  )
}
