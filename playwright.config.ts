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
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // One worker everywhere, not just in CI. fullyParallel:false only serialises
  // tests WITHIN a file, so more than one worker runs spec FILES in parallel
  // against the one shared database: admin-merge's dated fixture rows would be
  // alive while timeline asserts LIBRARY EMPTY. One shared database, one worker.
  // * Long-term cost: the local run is strictly serial. Per-worker database
  // * isolation is the alternative, and is the right answer only once the suite
  // * grows past a few minutes.
  workers: 1,
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
