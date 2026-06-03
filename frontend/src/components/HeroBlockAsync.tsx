import { getPayload } from 'payload'
import config from '@payload-config'
import { HeroSlider, type HeroSlide } from './HeroSlider'
import { displayTitle, animeBanner } from '@/lib/anime'

// Async-Serverkomponente: lädt Hero-Quelle (Featured → sonst beliebteste) und rendert den Slider.
export async function HeroBlockAsync() {
  const payload = await getPayload({ config })

  let pool = await payload.find({
    collection: 'anime',
    where: { isFeatured: { equals: true } },
    sort: '-popularity',
    limit: 6,
    depth: 0,
  })
  if (!pool.docs.length) {
    pool = await payload.find({ collection: 'anime', sort: '-popularity', limit: 6, depth: 0 })
  }

  const slides: HeroSlide[] = pool.docs.map((a: any) => ({
    imageUrl: animeBanner(a),
    title: displayTitle(a),
    href: `/anime/${a.slug}`,
  }))

  return (
    <HeroSlider
      slides={slides}
      heading="Deine deutschsprachige Anime-Datenbank"
      subheading="Anime, Charaktere, Studios und Seasons — verlinkt, durchsuchbar und immer aktuell."
    />
  )
}
