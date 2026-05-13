import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

// Mirrors Next.js's env loader so .env / .env.local feed into Playwright's
// runner process the same way they feed into `pnpm dev`. Required for tests to
// see ADMIN_PASS without a separate dotenv setup.
loadEnvConfig(process.cwd())

const PORT = process.env.PORT ?? '3000'
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
