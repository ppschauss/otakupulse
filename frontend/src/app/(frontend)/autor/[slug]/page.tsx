import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { articleCategoryLabel } from '@/lib/anime'

export const dynamic = 'force-dynamic'

async function getAuthor(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'authors', where: { slug: { equals: slug } }, limit: 1 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = await getAuthor(slug)
  if (!a) return {}
  return { title: `${a.name} — Autor | OtakuPulse`, description: a.bioDe || `Artikel von ${a.name} auf OtakuPulse.` }
}

function fmtDate(d?: string | null) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return ''
  }
}

export default async function AuthorDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const author = await getAuthor(slug)
  if (!author) notFound()

  const payload = await getPayload({ config })
  const articles = await payload.find({
    collection: 'articles',
    where: { author: { equals: author.id }, _status: { equals: 'published' } },
    sort: '-publishDate',
    limit: 50,
    depth: 0,
  })

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-4">
        {author.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={author.avatarUrl} alt={author.name} className="h-20 w-20 rounded-full object-cover ring-1 ring-white/10" />
        ) : null}
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Autor</p>
          <h1 className="mt-1 text-3xl font-extrabold text-white">{author.name}</h1>
        </div>
      </div>

      {author.bioDe ? <p className="mt-6 max-w-2xl leading-relaxed text-zinc-300">{author.bioDe}</p> : null}

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold text-white">Artikel ({articles.totalDocs})</h2>
        {articles.docs.length === 0 ? (
          <p className="text-zinc-400">Noch keine veröffentlichten Artikel.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {articles.docs.map((a: any) => (
              <li key={a.id} className="py-3">
                <Link href={`/news/${a.slug}`} className="group block">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    {a.category ? <span className="font-semibold text-accent">{articleCategoryLabel(a.category)}</span> : null}
                    {a.publishDate ? <span>· {fmtDate(a.publishDate)}</span> : null}
                  </div>
                  <span className="text-base font-medium text-zinc-100 transition group-hover:text-accent">{a.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
