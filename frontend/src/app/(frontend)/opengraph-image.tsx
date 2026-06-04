import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'OtakuPulse — Deutschsprachige Anime-Datenbank'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #09090b 0%, #1a1023 60%, #2a1030 100%)',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 800 }}>
          <span style={{ color: '#ff4d6d' }}>Otaku</span>
          <span style={{ color: '#e4e4e7' }}>Pulse</span>
        </div>
        <div style={{ marginTop: 24, fontSize: 40, color: '#a1a1aa', maxWidth: 900 }}>
          Die deutschsprachige Anime-Datenbank
        </div>
        <div style={{ marginTop: 16, fontSize: 28, color: '#71717a' }}>
          Anime · Charaktere · Studios · Streaming · Kalender · News
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 70,
            left: 80,
            width: 220,
            height: 8,
            borderRadius: 8,
            background: 'linear-gradient(90deg, #ff4d6d, #8b5cf6)',
          }}
        />
      </div>
    ),
    { ...size },
  )
}
