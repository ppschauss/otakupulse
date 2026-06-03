import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Erlaubt dem Dev-Server, /_next/-Ressourcen an diese Origins auszuliefern
  // (sonst bleibt z.B. das Admin-Panel im LAN weiß, weil die JS-Chunks geblockt werden).
  allowedDevOrigins: ['192.168.0.161', '100.87.113.82'],
  // Bilder: AniList-CDN als Fallback (Cover/Banner liegen i.d.R. lokal unter /media).
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 's4.anilist.co' }],
  },
}

export default withPayload(nextConfig)
