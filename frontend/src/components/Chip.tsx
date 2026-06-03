import Link from 'next/link'

// Pillen-Link für Taxonomien (Genres, Tags, Plattformen …).
export function Chip({ href, children, count }: { href: string; children: React.ReactNode; count?: number }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-accent/15 to-accent-2/15 px-4 py-1.5 text-sm text-zinc-200 ring-1 ring-white/10 transition hover:from-accent/30 hover:to-accent-2/30 hover:text-white"
    >
      {children}
      {typeof count === 'number' ? <span className="text-xs text-zinc-400">{count}</span> : null}
    </Link>
  )
}
