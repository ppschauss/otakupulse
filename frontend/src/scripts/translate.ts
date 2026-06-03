/**
 * KI-Übersetzung/Umschreibung (Claude Haiku 4.5):
 *  - Anime: englische AniList-Beschreibung → eigenständiger deutscher Text (descriptionDe)
 *  - Genres/Tags/Studios: generierte deutsche SEO-Beschreibung (descriptionDe)
 *
 * "Deutsch wenn vorhanden, sonst Englisch" macht die Anzeige bereits automatisch
 * (descriptionDe || descriptionSource). Dieses Script befüllt nur die *De-Felder.
 *
 * Voraussetzung: ANTHROPIC_API_KEY in der Umgebung (secrets.env → Container).
 * Aufruf:
 *   npm run translate                 # alles (Anime + Genres + Tags + Studios)
 *   npm run translate -- --anime      # nur Anime
 *   npm run translate -- --genres --tags --studios
 *   npm run translate -- --limit 50   # zum Testen: max. 50 Docs je Collection
 */
import { getPayload, type Payload } from 'payload'
import config from '../payload.config'
import Anthropic from '@anthropic-ai/sdk'
import { displayTitle } from '../lib/anime'

const MODEL = 'claude-haiku-4-5'
const CONCURRENCY = 5

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('✗ ANTHROPIC_API_KEY fehlt. In secrets.env eintragen und den Container neu starten.')
  process.exit(1)
}
const anthropic = new Anthropic({ apiKey, maxRetries: 6 })

// --- System-Prompts (statisch → Prompt-Caching greift) -------------------

const ANIME_SYS =
  'Du bist Redakteur:in einer deutschsprachigen Anime-Datenbank. Du erhältst eine englische ' +
  'Anime-Beschreibung und überträgst sie ins Deutsche. Übersetze NICHT wörtlich, sondern formuliere ' +
  'den Inhalt eigenständig, natürlich und flüssig neu (eigene Satzstruktur), damit der Text einzigartig ' +
  'und suchmaschinenfreundlich ist. Alle Fakten bleiben korrekt; erfinde nichts dazu. Schreibe 2–3 ' +
  'Absätze im sachlich-begeisterten Stil einer Anime-Seite. Lass Quellenangaben, Meta-Hinweise und ' +
  'Spoiler-Warnungen weg. Antworte AUSSCHLIESSLICH mit dem fertigen deutschen Text – keine Einleitung, ' +
  'keine Anführungszeichen, kein Markdown.'

const GENRE_SYS =
  'Du bist SEO-Redakteur:in einer deutschsprachigen Anime-Datenbank. Schreibe eine eigenständige, ' +
  'suchmaschinenfreundliche deutsche Beschreibung (ca. 120–160 Wörter) für ein Anime-GENRE: was es ' +
  'ausmacht, typische Merkmale und für wen es geeignet ist. Natürlicher Fließtext, kein Listenformat, ' +
  'keine erfundenen Fakten. Antworte ausschließlich mit dem Text – keine Überschrift, keine Anführungszeichen.'

const TAG_SYS =
  'Du bist SEO-Redakteur:in einer deutschsprachigen Anime-Datenbank. Schreibe eine kurze, eigenständige ' +
  'deutsche Beschreibung (ca. 50–80 Wörter) für ein thematisches Anime-TAG: was das Motiv/Element ' +
  'bedeutet und wie es in Anime vorkommt. Natürlicher Fließtext, keine erfundenen Fakten. Antworte ' +
  'ausschließlich mit dem Text – keine Überschrift, keine Anführungszeichen.'

const STUDIO_SYS =
  'Du bist SEO-Redakteur:in einer deutschsprachigen Anime-Datenbank. Schreibe eine kurze deutsche ' +
  'Beschreibung (ca. 60–90 Wörter) für ein Anime-STUDIO. WICHTIG: Wenn dir das Studio nicht sicher ' +
  'bekannt ist, bleibe allgemein und erfinde KEINE Fakten (keine erfundenen Gründungsjahre, Werke oder ' +
  'Orte). Natürlicher Fließtext. Antworte ausschließlich mit dem Text – keine Überschrift, keine Anführungszeichen.'

// --- Helfer --------------------------------------------------------------

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\(Source:[^)]*\)/gi, '')
    .replace(/\(Quelle:[^)]*\)/gi, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function rewrite(system: string, user: string, maxTokens: number): Promise<string> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  })
  const block = res.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text.trim() : ''
}

async function pool<T>(items: T[], n: number, fn: (it: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++])
    }),
  )
}

type Task = {
  collection: any
  system: string
  maxTokens: number
  where: any
  buildUser: (doc: any) => string | null
}

async function run(payload: Payload, label: string, t: Task, limit?: number) {
  console.log(`→ ${label} …`)
  let done = 0
  let written = 0
  let failed = 0
  // Übersetzte Docs verlassen den Filter automatisch → immer Seite 1 holen.
  // Dauerhaft fehlschlagende IDs ausschließen, sonst blockieren sie den Anfang.
  const failedIds: any[] = []
  for (;;) {
    if (limit && done >= limit) break
    const pageSize = limit ? Math.min(100, limit - done) : 100
    const where = failedIds.length ? { and: [t.where, { id: { not_in: failedIds } }] } : t.where
    const res = await payload.find({ collection: t.collection, where, limit: pageSize, page: 1, depth: 0 })
    if (!res.docs.length) break

    // 1) KI-Aufrufe parallel (rate-limitiert durch den Pool)
    const pending: { id: any; text: string }[] = []
    const errored: any[] = []
    await pool(res.docs as any[], CONCURRENCY, async (doc) => {
      const user = t.buildUser(doc)
      if (!user) {
        errored.push(doc.id)
        return
      }
      try {
        const text = await rewrite(t.system, user, t.maxTokens)
        if (text) pending.push({ id: doc.id, text })
        else errored.push(doc.id)
      } catch (err: any) {
        errored.push(doc.id)
        failed++
        if (failed <= 3) console.warn(`  ⚠ ${err?.message || err}`)
      }
    })

    // 2) DB-Updates SERIELL (Payload schreibt verschachtelte Arrays neu → parallel = Konflikt)
    for (const p of pending) {
      try {
        await payload.update({ collection: t.collection, id: p.id, data: { descriptionDe: p.text } as any })
        written++
      } catch {
        errored.push(p.id)
        failed++
      }
    }

    failedIds.push(...errored)
    done += res.docs.length
    console.log(`  ${label}: ${done} verarbeitet · ${written} geschrieben · ${failed} Fehler`)
  }
  console.log(`✓ ${label}: ${written} Texte geschrieben (${failed} Fehler)`)
}

async function main() {
  const args = process.argv.slice(2)
  const all = !args.some((a) => ['--anime', '--genres', '--tags', '--studios'].includes(a))
  const want = (k: string) => all || args.includes(`--${k}`)
  const limArg = args.indexOf('--limit')
  const limit = limArg >= 0 ? Number(args[limArg + 1]) : undefined

  const payload = await getPayload({ config })
  console.log(`→ KI-Übersetzung mit ${MODEL}${limit ? ` (Limit ${limit}/Collection)` : ''}`)

  if (want('anime')) {
    await run(
      payload,
      'Anime',
      {
        collection: 'anime',
        system: ANIME_SYS,
        maxTokens: 900,
        where: { and: [{ descriptionSource: { exists: true } }, { descriptionDe: { exists: false } }] },
        buildUser: (d) => {
          const src = stripHtml(d.descriptionSource || '')
          if (!src) return null
          return `Titel: ${displayTitle(d)}\n\nEnglische Beschreibung:\n${src}`
        },
      },
      limit,
    )
  }
  if (want('genres')) {
    await run(
      payload,
      'Genres',
      {
        collection: 'genres',
        system: GENRE_SYS,
        maxTokens: 500,
        where: { descriptionDe: { exists: false } },
        buildUser: (d) => (d.name ? `Genre: ${d.name}` : null),
      },
      limit,
    )
  }
  if (want('tags')) {
    await run(
      payload,
      'Tags',
      {
        collection: 'tags',
        system: TAG_SYS,
        maxTokens: 300,
        where: { descriptionDe: { exists: false } },
        buildUser: (d) => (d.name ? `Tag: ${d.name}` : null),
      },
      limit,
    )
  }
  if (want('studios')) {
    await run(
      payload,
      'Studios',
      {
        collection: 'studios',
        system: STUDIO_SYS,
        maxTokens: 350,
        where: { descriptionDe: { exists: false } },
        buildUser: (d) => (d.name ? `Studio: ${d.name}` : null),
      },
      limit,
    )
  }

  console.log('✓ KI-Übersetzung abgeschlossen.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
