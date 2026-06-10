import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import Image from 'next/image'
import { liveArticleFilters } from '@/lib/anime'

function fmtDate(d?: string | null) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

// Sidebar mit den neuesten Artikeln der Kategorie „Season-Vorschau".
export async function NewsSidebar() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'articles',
    where: { and: [{ category: { equals: 'seasonal_preview' } }, ...liveArticleFilters()] },
    sort: '-publishDate',
    limit: 6,
    depth: 0,
  })

  return (
    <aside className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Season-Vorschau</h3>
        <Link href="/news" className="text-xs text-zinc-500 hover:text-accent">
          mehr →
        </Link>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Noch keine Season-Vorschauen veröffentlicht. Artikel der Kategorie „Season-Vorschau" erscheinen hier
          automatisch.
        </p>
      ) : (
        <ul className="space-y-3">
          {docs.map((a: any) => (
            <li key={a.id}>
              <Link href={`/news/${a.slug}`} className="group flex gap-3">
                {a.coverImageUrl ? (
                  <Image src={a.coverImageUrl} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-gradient-to-br from-accent/20 to-accent-2/20" />
                )}
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-medium text-zinc-200 transition group-hover:text-accent">
                    {a.title}
                  </p>
                  <p className="text-xs text-zinc-500">{fmtDate(a.publishDate)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
