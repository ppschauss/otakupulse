'use client'

// Globaler Fehler-Fallback (ersetzt das Root-Layout, wenn dort etwas crasht).
// Muss eigenes <html>/<body> mitbringen und in sich geschlossen sein.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090b',
          color: '#e4e4e7',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          textAlign: 'center',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: '32rem' }}>
          <p
            style={{
              fontSize: '3.5rem',
              fontWeight: 800,
              margin: 0,
              background: 'linear-gradient(to right, #ff4d6d, #8b5cf6)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Ups
          </p>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', marginTop: '1rem' }}>
            Da ist etwas schiefgelaufen
          </h1>
          <p style={{ color: '#a1a1aa', marginTop: '0.75rem', lineHeight: 1.6 }}>
            Es ist ein unerwarteter Fehler aufgetreten. Bitte versuch es erneut.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: '2rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#ff4d6d',
              color: '#fff',
              padding: '0.625rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  )
}
