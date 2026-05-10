import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: {
    remotePatterns: [
      // E1-E7 movies/TV via TMDB
      { protocol: 'https', hostname: 'image.tmdb.org' },
      // E8 anime/manga via AniList (per AR15)
      { protocol: 'https', hostname: 's4.anilist.co' },
      // E8 anime/manga legacy MAL covers (pre-existing; harmless)
      { protocol: 'https', hostname: 'cdn.myanimelist.net' },
      // E9 games via Steam — primary CDN
      { protocol: 'https', hostname: 'cdn.cloudflare.steamstatic.com' },
      // E9 games via Steam — secondary host
      { protocol: 'https', hostname: 'media.steampowered.com' },
      // E9 games via IGDB cover-image CDN
      { protocol: 'https', hostname: 'images.igdb.com' },
    ],
  },
}

export default nextConfig
