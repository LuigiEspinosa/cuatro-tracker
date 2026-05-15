import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // postgress
  DATABASE_URL: z.url(),
  DB_PASS: z.string().min(1),

  // redis
  REDIS_URL: z.url(),

  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.url(),
  ADMIN_PASS: z.string().min(8),

  // external APIs
  TMDB_API_KEY: z.string().min(1),
  // ISO 3166-1 alpha-2 country code for TMDB watch-provider lookups.
  // Defaults to CO (Colombia); future Settings page (Phase 11+) will let
  // Cuatro override at runtime.
  TMDB_WATCH_PROVIDER_COUNTRY: z.string().length(2).default('CO'),
  IGDB_CLIENT_ID: z.string().min(1),
  IGDB_CLIENT_SECRET: z.string().min(1),
  STEAM_API_KEY: z.string().min(1),
  STEAM_USER_ID: z.string().min(1),

  // qBittorrent (internal docker network)
  QBITTORRENT_HOST: z.url(),
  QBITTORRENT_USER: z.string().min(1),
  QBITTORRENT_PASS: z.string().min(1),
  DOWNLOAD_PATH: z.string().min(1),

  CLOUDFLARE_API_TOKEN: z.string().optional(),

  // Sentry — optional. Unset OR empty string means Sentry init is a no-op.
  // The preprocess coerces compose's '${SENTRY_DSN:-}' (which yields '' when unset)
  // to undefined so .url() doesn't reject empty string at module-load.
  SENTRY_DSN: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().optional(),
  ),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  const summary = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n')

  console.error(`Invalid environment variables:\n${summary}`)
  throw parsed.error
}

export const env = parsed.data
export type Env = z.infer<typeof EnvSchema>
