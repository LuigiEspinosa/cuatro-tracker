import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'coverage/**',
      'next-env.d.ts',
      '**/*.tsbuildinfo',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.type='MemberExpression'][object.object.name='process'][object.property.name='env']",
          message:
            "Use `import { env } from '@/lib/env'` instead of `process.env`. Add new vars to the Zod schema in lib/env.ts.",
        },
        {
          selector: "NewExpression[callee.name='Redis']",
          message:
            "Use the shared `redis` singleton from '@/lib/redis' instead of constructing `new Redis(...)` directly. BullMQ Queue and Worker constructors should pass `{ connection: redis }`.",
        },
      ],
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['lib/env.ts', 'lib/__tests__/env.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
  {
    // NEXT_PUBLIC_ vars are baked into the client bundle at build time and cannot
    // flow through lib/env.ts (server-side Zod schema). These files read NEXT_PUBLIC_
    // vars directly from process.env by design.
    files: ['app/layout.tsx', 'instrumentation-client.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['lib/redis.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['lib/logger.ts', 'prisma/seed.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Playwright config + e2e specs run under Node (Playwright runner), not the
    // Next.js bundle. They read CI / PORT / ADMIN_PASS directly from process.env
    // by design — these are tooling vars, not application secrets routed through
    // lib/env.ts's Zod schema.
    files: ['playwright.config.ts', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
]

export default eslintConfig
