import type { Field } from 'payload'

// Wiederverwendbarer SEO-Block (eingeklappt) für alle indexierbaren Entitäten.
export const seoFields: Field = {
  type: 'collapsible',
  label: 'SEO',
  admin: { initCollapsed: true },
  fields: [
    { name: 'seoTitle', type: 'text' },
    { name: 'seoDescription', type: 'textarea' },
    { name: 'seoKeywords', type: 'text', hasMany: true },
    { name: 'noindex', type: 'checkbox', defaultValue: false },
    { name: 'canonicalUrl', type: 'text' },
  ],
}
