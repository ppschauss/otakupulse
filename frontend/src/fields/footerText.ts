import type { Field } from 'payload'

// Kontextabhängige Variablen je nach Datensatz-Typ (zusätzlich zu Basis-Variablen).
const ENTITY_VARS_HELP =
  'Variablen — überall: {{siteName}}, {{year}}, {{url}}, {{name}}/{{title}}, {{slug}}. ' +
  'Anime zusätzlich: {{titleRomaji}}, {{titleEnglish}}, {{titleGerman}}, {{season}}, {{seasonYear}}, ' +
  '{{format}}, {{status}}, {{episodes}}, {{score}}, {{studio}}, {{studios}}, {{genres}}, {{platforms}}. ' +
  'Genre: {{parentSlug}}, {{parentName}}, {{count}}. Tag: {{category}}, {{count}}. Studio: {{count}}. ' +
  'Charakter: {{gender}}. Person: {{roles}}.'

// Optionaler SEO-/Footer-Textblock am Seitenende einer Detailseite.
export const footerTextField: Field = {
  name: 'footerText',
  type: 'richText',
  label: 'Footer-Text (SEO)',
  admin: { description: 'Optionaler Textblock am Seitenende. ' + ENTITY_VARS_HELP },
}
