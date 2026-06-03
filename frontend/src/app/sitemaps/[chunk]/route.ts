import { getPayload } from 'payload'
import config from '@payload-config'
import { TYPES, PER, STATIC_PATHS, xmlEscape } from '@/lib/sitemap'
import { url } from '@/lib/site'

export const dynamic = 'force-dynamic'

type Entry = { loc: string; lastmod?: string }

function render(entries: Entry[]): Response {
  const body = entries
    .map(
      (e) =>
        `  <url><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`,
    )
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}

export async function GET(_req: Request, { params }: { params: Promise<{ chunk: string }> }) {
  const { chunk } = await params
  const id = chunk.replace(/\.xml$/, '')

  if (id === 'static') {
    return render(STATIC_PATHS.map((p) => ({ loc: url(p) })))
  }

  const dash = id.lastIndexOf('-')
  const key = id.slice(0, dash)
  const page = Number(id.slice(dash + 1)) + 1
  const type = TYPES.find((t) => t.key === key)
  if (!type || !Number.isFinite(page)) return render([])

  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: type.collection,
    where: type.where,
    limit: PER,
    page,
    depth: 0,
    select: { slug: true, updatedAt: true },
  })

  const entries: Entry[] = res.docs
    .filter((d: any) => d.slug)
    .map((d: any) => ({
      loc: url(type.path(d.slug)),
      lastmod: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
    }))

  return render(entries)
}
