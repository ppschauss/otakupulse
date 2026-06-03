import { listChunkIds } from '@/lib/sitemap'
import { url } from '@/lib/site'

export const dynamic = 'force-dynamic'

// Sitemap-Index: verweist auf die einzelnen (aufgeteilten) Sitemaps.
export async function GET() {
  const ids = await listChunkIds()
  const entries = ids
    .map((id) => `  <sitemap><loc>${url(`/sitemaps/${id}.xml`)}</loc></sitemap>`)
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
