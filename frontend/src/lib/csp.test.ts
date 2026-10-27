import { describe, it, expect } from 'vitest'
import { buildContentSecurityPolicy } from '@/proxy'

const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d.startsWith(name + ' ')) || ''

describe('Content-Security-Policy', () => {
  const csp = buildContentSecurityPolicy(true)

  it('lässt AdSense und das CMP ihre Skripte laden', () => {
    const script = directive(csp, 'script-src')
    expect(script).toContain('https://pagead2.googlesyndication.com')
    expect(script).toContain('https://fundingchoicesmessages.google.com')
    // Reichweitenmessung darf dabei nicht verloren gehen.
    expect(script).toContain('https://www.googletagmanager.com')
  })

  it('erlaubt die iframes von Anzeigen und Einwilligungsnachricht', () => {
    const frame = directive(csp, 'frame-src')
    expect(frame).toContain('https://tpc.googlesyndication.com')
    expect(frame).toContain('https://googleads.g.doubleclick.net')
    // Trailer-Embeds bleiben erlaubt.
    expect(frame).toContain('https://www.youtube-nocookie.com')
  })

  it('bleibt ansonsten restriktiv', () => {
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).toContain('upgrade-insecure-requests')
    expect(buildContentSecurityPolicy(false)).not.toContain('upgrade-insecure-requests')
  })
})
