import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'e2e/**'],
    environmentMatchGlobs: [
      ['components/**/*.test.tsx', 'jsdom'],
      ['app/**/*.test.tsx', 'jsdom'],
      ['lib/**/*.test.tsx', 'jsdom'],
    ],
  },
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
