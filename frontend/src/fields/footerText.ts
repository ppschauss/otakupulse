import type { Field } from 'payload'
import { VARS_HELP } from '../lib/vars'

// Optionaler SEO-/Footer-Textblock am Seitenende einer Detailseite.
export const footerTextField: Field = {
  name: 'footerText',
  type: 'richText',
  label: 'Footer-Text (SEO)',
  admin: { description: 'Optionaler Textblock am Seitenende. ' + VARS_HELP },
}
