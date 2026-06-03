import Link from 'next/link'

// Wiederverwendbare Seiten-Navigation. `query` erlaubt zusätzliche Parameter
// (z.B. Suchfilter), die über die Seitenwechsel hinweg erhalten bleiben.
export function Pagination({
  basePath,
  page,
  totalPages,
  query,
}: {
  basePath: string
  page: number
  totalPages: number
  query?: Record<string, string | undefined>
}) {
  if (totalPages <= 1) return null

  const href = (p: number) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query || {})) if (v) params.set(k, v)
    params.set('page', String(p))
    return `${basePath}?${params.toString()}`
  }

  return (
    <nav className="mt-10 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5">
          ← Zurück
        </Link>
      ) : null}
      <span className="text-zinc-500">
        Seite {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5">
          Weiter →
        </Link>
      ) : null}
    </nav>
  )
}
