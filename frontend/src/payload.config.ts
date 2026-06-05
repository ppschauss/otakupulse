import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Authors } from './collections/Authors'
import { Anime } from './collections/Anime'
import { Episodes } from './collections/Episodes'
import { Characters } from './collections/Characters'
import { Persons } from './collections/Persons'
import { Studios } from './collections/Studios'
import { Genres } from './collections/Genres'
import { Tags } from './collections/Tags'
import { Platforms } from './collections/Platforms'
import { AnimeSeasons } from './collections/AnimeSeasons'
import { Articles } from './collections/Articles'
import { Navigation } from './globals/Navigation'
import { PageContent } from './globals/PageContent'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: '— OtakuPulse Admin',
    },
  },
  collections: [
    // Katalog
    Anime,
    Episodes,
    Characters,
    Persons,
    Studios,
    // Taxonomie
    Genres,
    Tags,
    Platforms,
    AnimeSeasons,
    // Redaktion
    Articles,
    Authors,
    Users,
  ],
  globals: [Navigation, PageContent],
  editor: lexicalEditor(),
  // Admin-Panel versteckt unter /legal/admin (Route-Ordner: (payload)/legal/admin)
  routes: { admin: '/legal/admin' },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
  sharp,
  plugins: [],
})
