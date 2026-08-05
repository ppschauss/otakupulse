import type { CollectionConfig } from 'payload'
import { externalIdFields, syncMetaFields } from '../fields/sync'
import { seoFields } from '../fields/seo'
import { footerTextField } from '../fields/footerText'

export const Anime: CollectionConfig = {
  slug: 'anime',
  labels: { singular: 'Anime', plural: 'Anime' },
  admin: {
    useAsTitle: 'titleRomaji',
    defaultColumns: ['titleRomaji', 'format', 'status', 'seasonYear', 'averageScore'],
    group: 'Katalog',
  },
  access: { read: () => true },
  fields: [
    ...externalIdFields,
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    {
      name: 'isFeatured',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar', description: 'Im Hero-Slider der Startseite hervorheben.' },
    },

    // --- Titel (mehrsprachig) ---
    {
      type: 'row',
      fields: [
        { name: 'titleRomaji', type: 'text', required: true },
        { name: 'titleEnglish', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'titleNative', type: 'text' },
        { name: 'titleGerman', type: 'text' },
      ],
    },

    // --- Stammdaten ---
    {
      type: 'row',
      fields: [
        { name: 'format', type: 'select', options: ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC'], index: true },
        { name: 'status', type: 'select', options: ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'], index: true },
        { name: 'episodes', type: 'number' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'season', type: 'select', options: ['WINTER', 'SPRING', 'SUMMER', 'FALL'] },
        { name: 'seasonYear', type: 'number', index: true },
        { name: 'duration', type: 'number' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'averageScore', type: 'number', index: true },
        { name: 'popularity', type: 'number', index: true },
        { name: 'countryOfOrigin', type: 'text', index: true, admin: { description: 'JP / KR / CN — Original-Herkunft (Sprache-Filter Teil 1).' } },
      ],
    },
    { name: 'source', type: 'text', admin: { description: 'Vorlage (manga, light_novel, original, …)' } },
    {
      name: 'availableLanguages',
      type: 'select',
      hasMany: true,
      admin: { description: 'Verfügbare Sub/Dub-Sprachen (Sprache-Filter Teil 2, später befüllt).' },
      options: [
        { label: 'Japanisch (Original)', value: 'ja' },
        { label: 'Deutscher Sub', value: 'de-sub' },
        { label: 'Deutscher Dub', value: 'de-dub' },
        { label: 'Englischer Sub', value: 'en-sub' },
        { label: 'Englischer Dub', value: 'en-dub' },
      ],
    },

    // --- Texte ---
    { name: 'descriptionSource', type: 'textarea', access: { read: ({ req }: any) => !!req?.user }, admin: { description: 'Originaltext der API-Quelle. Intern.' } },
    { name: 'descriptionDe', type: 'textarea', admin: { description: 'Öffentlicher deutscher Text (eigene Formulierung, SEO).' } },

    {
      name: 'streamingProviders',
      type: 'select',
      hasMany: true,
      index: true,
      admin: { description: 'Normalisierte Streaming-Anbieter (aus AniList-Links + JustWatch). Quelle für „Wer streamt es".' },
      options: [
        { label: 'Crunchyroll', value: 'crunchyroll' },
        { label: 'Netflix', value: 'netflix' },
        { label: 'Amazon Prime Video', value: 'amazon-prime-video' },
        { label: 'Disney+', value: 'disney-plus' },
        { label: 'WOW', value: 'wow' },
        { label: 'Joyn', value: 'joyn' },
        { label: 'RTL+', value: 'rtl-plus' },
        { label: 'Anime on Demand', value: 'anime-on-demand' },
        { label: 'Paramount+', value: 'paramount-plus' },
        { label: 'Apple TV', value: 'apple-tv' },
        { label: 'MagentaTV', value: 'magenta-tv' },
        { label: 'HIDIVE', value: 'hidive' },
        { label: 'Hulu', value: 'hulu' },
        { label: 'Bilibili', value: 'bilibili' },
        { label: 'iQIYI', value: 'iqiyi' },
        { label: 'WeTV', value: 'wetv' },
        { label: 'Adult Swim', value: 'adult-swim' },
        { label: 'Tencent Video', value: 'tencent' },
      ],
    },
    {
      // Zeitstempel der letzten JustWatch-Prüfung. Steuert die rollierende
      // Batch-Auffrischung (justwatch-streaming.py --stale N wählt die am
      // längsten nicht geprüften Titel). NULL = nie geprüft (kommt zuerst dran).
      name: 'streamingCheckedAt',
      type: 'date',
      index: true,
      admin: { position: 'sidebar', readOnly: true, description: 'Letzte JustWatch-Anbieter-Prüfung (rollierender Refresh).' },
    },

    // --- Bilder ---
    { name: 'coverImageUrl', type: 'text' },
    { name: 'bannerImageUrl', type: 'text' },
    { name: 'coverImageLocal', type: 'text', admin: { description: 'Lokal gespiegelter Pfad (später).' } },
    { name: 'bannerImageLocal', type: 'text' },
    { name: 'trailerUrl', type: 'text' },

    // --- Relationen ---
    { name: 'studios', type: 'relationship', relationTo: 'studios', hasMany: true },
    { name: 'genres', type: 'relationship', relationTo: 'genres', hasMany: true },
    {
      name: 'isHentai',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      label: 'Erwachsenen-Inhalt (Hentai)',
      admin: {
        description:
          'Genre „Hentai". Cover/Banner werden bei aktivem Jugendschutz geblurrt (FSK-18-Siegel) und der Titel ' +
          'wird NICHT automatisch in News/RSS-Feeds eingespeist. Wird beim AniList-Import automatisch gesetzt.',
      },
    },
    {
      name: 'tags',
      type: 'array',
      labels: { singular: 'Tag', plural: 'Tags' },
      fields: [
        { name: 'tag', type: 'relationship', relationTo: 'tags', required: true },
        { name: 'rank', type: 'number', admin: { description: 'Gewichtung 0–100 (AniList).' } },
      ],
    },
    {
      name: 'characters',
      type: 'array',
      labels: { singular: 'Charakter', plural: 'Charaktere' },
      fields: [
        { name: 'character', type: 'relationship', relationTo: 'characters', required: true },
        { name: 'role', type: 'select', options: ['MAIN', 'SUPPORTING', 'BACKGROUND'] },
      ],
    },
    {
      name: 'staff',
      type: 'array',
      labels: { singular: 'Staff', plural: 'Staff' },
      fields: [
        { name: 'person', type: 'relationship', relationTo: 'persons', required: true },
        { name: 'role', type: 'text', admin: { description: 'z.B. Director, Original Creator, Music' } },
      ],
    },
    {
      name: 'relations',
      type: 'array',
      labels: { singular: 'Verknüpfter Anime', plural: 'Verknüpfte Anime' },
      fields: [
        { name: 'anime', type: 'relationship', relationTo: 'anime', required: true },
        {
          name: 'relationType',
          type: 'select',
          options: ['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'ADAPTATION', 'ALTERNATIVE', 'SPIN_OFF', 'PARENT', 'OTHER'],
        },
      ],
    },
    { name: 'recommendations', type: 'relationship', relationTo: 'anime', hasMany: true, admin: { description: 'Ähnliche Titel (AniList-Recommendations).' } },
    { name: 'animeSeason', type: 'relationship', relationTo: 'anime-seasons' },
    {
      name: 'externalLinks',
      type: 'array',
      fields: [
        { name: 'platform', type: 'text' },
        { name: 'url', type: 'text' },
      ],
    },

    // Reverse: Episoden dieses Anime (Join heißt bewusst anders als das Skalar-Feld `episodes`)
    { name: 'episodeList', type: 'join', collection: 'episodes', on: 'anime' },

    ...syncMetaFields,
    footerTextField,
    seoFields,
  ],
}
