import { describe, expect, it } from 'vitest'
import nextConfig from '@/next.config'

describe('next.config.ts images.remotePatterns', () => {
  it('includes the foundation-epic CDN whitelist (AR15)', () => {
    const hosts =
      nextConfig.images?.remotePatterns?.map((p) => p.hostname) ?? []
    expect(hosts).toEqual(
      expect.arrayContaining([
        'image.tmdb.org',
        's4.anilist.co',
        'cdn.cloudflare.steamstatic.com',
        'media.steampowered.com',
        'images.igdb.com',
      ]),
    )
  })

  it('uses https for every pattern (no insecure http)', () => {
    const protocols =
      nextConfig.images?.remotePatterns?.map((p) => p.protocol) ?? []
    expect(protocols.length).toBeGreaterThan(0)
    expect(protocols.every((p) => p === 'https')).toBe(true)
  })
})
