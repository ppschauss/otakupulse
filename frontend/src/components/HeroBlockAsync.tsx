import { getPayload } from 'payload'
import config from '@payload-config'
import { HeroSlider, type HeroSlide } from './HeroSlider'
import { displayTitle, animeBanner } from '@/lib/anime'
import { getBlurAdult } from '@/lib/settings'

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

  const blurAdult = await getBlurAdult()
  const slides: HeroSlide[] = pool.docs.map((a: any) => ({
    imageUrl: animeBanner(a),
    title: displayTitle(a),
    href: `/anime/${a.slug}`,
    blur: blurAdult && !!a.isHentai,
  }))

  return (
    <HeroSlider
      slides={slides}
      heading="Deine deutschsprachige Anime-Datenbank"
      subheading="Anime, Charaktere, Studios und Seasons — verlinkt, durchsuchbar und immer aktuell."
    />
  )
}
