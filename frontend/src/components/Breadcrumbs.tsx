import Link from 'next/link'
import { breadcrumbLd } from '@/lib/seo'
import { JsonLd } from './JsonLd'

// Sichtbare Breadcrumb-Navigation + BreadcrumbList-Structured-Data.
export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  if (!items.length) return null
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
        {items.map((it, i) => (
          <span key={it.path} className="flex items-center gap-1.5">
            {i > 0 ? <span className="text-zinc-700">/</span> : null}
            {i < items.length - 1 ? (
              <Link href={it.path} className="transition hover:text-accent">
                {it.name}
              </Link>
            ) : (
              <span className="text-zinc-300">{it.name}</span>
            )}
          </span>
        ))}
      </nav>
      <JsonLd data={breadcrumbLd(items)} />
    </>
  )
}
