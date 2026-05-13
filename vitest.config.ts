import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    environmentMatchGlobs: [
      ['components/**/*.test.tsx', 'jsdom'],
      ['app/**/*.test.tsx', 'jsdom'],
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
