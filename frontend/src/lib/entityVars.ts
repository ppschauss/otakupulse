// Kontextabhängige Platzhalter-Variablen aus einer geladenen Entität.
// Werden in Footer-Texten und (über applyVarsMeta) in Meta-Tags ersetzt.
import {
  displayTitle,
  displayName,
  seasonLabel,
  formatLabel,
  statusLabel,
  genderLabel,
  personRoleLabel,
  TAG_CATEGORY_LABELS,
} from './anime'
import { streamingProvidersOf } from './streaming'
import type { Vars } from './vars'

// Namen aus einer Relationship-Liste (nur aufgelöste Objekte).
const relNames = (arr: any, key = 'name'): string[] =>
  (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x === 'object' && x[key]).map((x) => String(x[key]))

const str = (v: any): string => (v === null || v === undefined || v === '' ? '' : String(v))

export function animeVars(anime: any): Vars {
  const studios = relNames(anime?.studios)
  const genres = relNames(anime?.genres)
  const platforms = streamingProvidersOf(anime).map((p) => p.provider.name)
  const season = anime?.season
    ? `${seasonLabel(anime.season)}${anime.seasonYear ? ` ${anime.seasonYear}` : ''}`
    : str(anime?.seasonYear)
  return {
    title: displayTitle(anime),
    titleRomaji: str(anime?.titleRomaji),
    titleEnglish: str(anime?.titleEnglish),
    titleGerman: str(anime?.titleGerman),
    slug: str(anime?.slug),
    season,
    seasonYear: str(anime?.seasonYear),
    format: formatLabel(anime?.format),
    status: statusLabel(anime?.status),
    episodes: str(anime?.episodes),
    duration: str(anime?.duration),
    score: str(anime?.averageScore),
    source: str(anime?.source),
    studio: studios[0] ?? '',
    studios: studios.join(', '),
    genres: genres.join(', '),
    platforms: platforms.join(', '),
  }
}

export function genreVars(g: any): Vars {
  const parent = g?.parentGenre && typeof g.parentGenre === 'object' ? g.parentGenre : null
  return {
    name: str(g?.name),
    title: str(g?.name),
    slug: str(g?.slug),
    parentSlug: str(parent?.slug),
    parentName: str(parent?.name),
  }
}

export function tagVars(t: any): Vars {
  return {
    name: str(t?.name),
    title: str(t?.name),
    slug: str(t?.slug),
    category: t?.category ? (TAG_CATEGORY_LABELS[t.category] ?? t.category) : '',
  }
}

export function studioVars(s: any): Vars {
  return { name: str(s?.name), title: str(s?.name), slug: str(s?.slug) }
}

export function characterVars(c: any): Vars {
  const n = displayName(c)
  return { name: n, title: n, slug: str(c?.slug), gender: genderLabel(c?.gender) }
}

export function personVars(p: any): Vars {
  const n = displayName(p)
  const roles = (Array.isArray(p?.roles) ? p.roles : []).map((r: any) => personRoleLabel(r)).filter(Boolean)
  return { name: n, title: n, slug: str(p?.slug), roles: roles.join(', ') }
}
