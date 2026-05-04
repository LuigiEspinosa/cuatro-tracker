import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
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
]

export default eslintConfig
