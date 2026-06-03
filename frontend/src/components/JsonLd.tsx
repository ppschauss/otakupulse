// Bettet ein JSON-LD-Objekt als <script> für Structured Data ein.
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}
