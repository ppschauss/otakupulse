/**
 * Einmaliges Script: legt den redaktionellen Artikel zum neuen Original-Kinofilm
 * „Sword Art Online the Movie –Integral Domain–" (Kinostart 2028) an und
 * veröffentlicht ihn. Cover = offizielles Teaser-Standbild (lokal), Trailer als
 * YouTube-Embed. Idempotent über den Slug.
 *
 * Aufruf (enrich-Container = Live-Code + DB):
 *   docker exec --env-file secrets.env otakupulse-enrich sh -lc 'cd /app && npx tsx src/scripts/create-sao-integral-domain.ts'
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { toLexical, type Valid } from '../lib/articleBody'

const SLUG = 'sao-integral-domain-2028'
const COVER = '/media/article/sao-integral-domain-2028.jpg'
const TRAILER = 'https://www.youtube.com/watch?v=UHWMxtRivt8'

const HEADLINE = 'Sword Art Online –Integral Domain–: Neuer Original-Kinofilm für 2028 angekündigt'
const EXCERPT =
  'Kirito und Asuna kehren zurück: Mit „Sword Art Online the Movie –Integral Domain–" kündigt Aniplex einen komplett originalen Kinofilm für 2028 an – die erste eigenständige Story nach Alicization.'

// Body als Marker-Fließtext ([[anime:slug|Label]] wird zu internen Links).
const BODY = `Es ist offiziell: Die [[anime:sword-art-online|Sword Art Online]]-Reihe kehrt auf die große Leinwand zurück. Unter dem Titel **Sword Art Online the Movie –Integral Domain–** wurde ein brandneuer Kinofilm angekündigt, der 2028 in die japanischen Kinos kommen soll. Zum Auftakt gibt es bereits ein erstes Teaser-Visual und einen kurzen Trailer – und die Botschaft ist unmissverständlich: Kirito und Asuna sind zurück.

Das Besondere daran: **Integral Domain** ist kein Adaptions-Film, sondern eine **komplett originale Geschichte**. Konzept und Story stammen direkt von Reihen-Schöpfer Reki Kawahara. Damit ist es der erste vollständig eigenständige SAO-Kinofilm seit [[anime:sword-art-online-ordinal-scale|Ordinal Scale]] (2017) – und diesmal spielt die Handlung **nach dem Alicization-Arc**.

## Wer steckt dahinter?

Auf dem Regiestuhl sitzt **Shingo Adachi**, den viele von „Lycoris Recoil" kennen und der SAO-Fans ohnehin ein Begriff ist: Er war bereits als Charakterdesigner der Reihe an Bord. Für die Animation zeichnet **A-1 Pictures** verantwortlich – konkret das neue Label **Psyde Kick Studio**. Bei den Stimmen bleibt alles beim Alten: **Yoshitsugu Matsuoka** spricht erneut Kirito, **Haruka Tomatsu** kehrt als Asuna zurück.

Nach der [[anime:sword-art-online-alicization|Alicization]]-Saga war lange offen, wohin die Reise geht. Mit einer originalen Kino-Story, dem Original-Cast und dem Schöpfer höchstpersönlich an der Feder setzt Integral Domain jetzt ein dickes Ausrufezeichen. Bis 2028 ist es zwar noch ein ordentliches Stück hin – aber der Hype-Zug rollt ab sofort.

## Steckbrief

| **Titel** | Sword Art Online the Movie –Integral Domain– |
| **Typ** | Kinofilm (Original-Story) |
| **Release** | 2028 (Kino, Japan) |
| **Studio** | A-1 Pictures / Psyde Kick Studio |
| **Regie** | Shingo Adachi |
| **Original-Story** | Reki Kawahara |
| **Setting** | nach dem Alicization-Arc |
| **Cast** | Yoshitsugu Matsuoka (Kirito), Haruka Tomatsu (Asuna) |`

const LINKED_SLUGS = ['sword-art-online', 'sword-art-online-ordinal-scale', 'sword-art-online-alicization']

async function main() {
  const payload = await getPayload({ config })

  // Dedup über den Slug.
  const existing = await payload.find({ collection: 'articles', where: { slug: { equals: SLUG } }, limit: 1, depth: 0 })

  // Autor (Redaktion) sicherstellen.
  const authorRes = await payload.find({ collection: 'authors', where: { slug: { equals: 'otakupulse-redaktion' } }, limit: 1 })
  const authorId = authorRes.docs.length
    ? authorRes.docs[0].id
    : (await payload.create({ collection: 'authors', data: { name: 'OtakuPulse Redaktion', slug: 'otakupulse-redaktion', role: 'editor' } as any })).id

  // relatedAnime + valide Slugs für die Link-Marker.
  const animeIds: any[] = []
  const validAnime = new Set<string>()
  for (const slug of LINKED_SLUGS) {
    const r = await payload.find({ collection: 'anime', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
    if (r.docs.length) {
      animeIds.push(r.docs[0].id)
      validAnime.add(slug)
    }
  }

  const valid: Valid = { anime: validAnime, studio: new Set(), genre: new Set(), tag: new Set() }
  const { root } = toLexical(BODY, valid)

  const data: any = {
    title: HEADLINE,
    slug: SLUG,
    excerpt: EXCERPT,
    category: 'news',
    coverImageUrl: COVER,
    trailerUrl: TRAILER,
    body: { root },
    author: authorId,
    relatedAnime: animeIds,
    publishDate: new Date().toISOString(),
    _status: 'published',
  }

  if (existing.docs.length) {
    await payload.update({ collection: 'articles', id: existing.docs[0].id, data })
    console.log(`↻ Aktualisiert: /news/${SLUG} (verlinkte Anime: ${validAnime.size})`)
  } else {
    await payload.create({ collection: 'articles', data })
    console.log(`✓ Erstellt & veröffentlicht: /news/${SLUG} (verlinkte Anime: ${validAnime.size})`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
