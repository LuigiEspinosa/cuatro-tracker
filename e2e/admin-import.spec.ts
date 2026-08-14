import { expect, test, type Page } from '@playwright/test'
import { cleanupSeeded, steamExportFixture } from './fixtures/library-seed'

// Story 11.5 AC-1 / AC-7 / AC-10. The wizard-render and unauth slices need only
// ADMIN_PASS; the end-to-end import needs the BullMQ worker running (CI starts
// one, locally run `pnpm exec tsx --env-file=.env worker.ts` alongside
// `pnpm infra`; without the env file the worker dies on Zod validation before
// its first log line).
//
// * Roads not taken: the original 100-row TRAKT_JSON fixture. That path calls
// * live TMDB once per row, and CI sets TMDB_API_KEY to a placeholder, so it
// * could never run there. STEAM_EXPORT makes zero external calls and is written
// * straight from the parsed row. The Trakt parse path stays covered by the
// * lib/import Vitest suites.
// * Failure mode worth NOT chasing: a 30-row import can finish before the
// * browser subscribes to the SSE stream. The events route already recovers the
// * missed terminal frame from the stored BullMQ job state, so the summary still
// * renders. Do not "fix" that race here.

const ADMIN_PASS = process.env.ADMIN_PASS
const IMPORT_ROW_COUNT = 30

// Generous for a network-free import of 30 rows, and short enough that a
// regression fails fast instead of hanging the job.
const IMPORT_COMPLETION_TIMEOUT_MS = 15_000

test.beforeAll(async () => {
  if (!ADMIN_PASS) {
    throw new Error(
      'ADMIN_PASS env is required for e2e tests. Set it in .env (local) or the CI env block.',
    )
  }
})

async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
  await page.getByRole('button', { name: '> LOG IN' }).click()
  await page.waitForURL('/', { timeout: 10_000 })
}

test.describe('/admin/import wizard (Story 11.5)', () => {
  test('AC-1: renders the three wizard steps and the three format radios', async ({
    page,
  }) => {
    test.skip(!process.env.ADMIN_PASS, 'Requires ADMIN_PASS to authenticate.')

    await login(page)
    await page.goto('/admin/import')

    await expect(
      page.getByRole('heading', { name: 'BULK IMPORT' }),
    ).toBeVisible({ timeout: 10_000 })

    // Scope to the steps list: 'SELECT FORMAT' also appears as the step-1
    // fieldset legend, so an unscoped exact match would be ambiguous.
    const steps = page.getByRole('list', { name: 'Import steps' })
    for (const label of ['SELECT FORMAT', 'UPLOAD FILE', 'REVIEW & CONFIRM']) {
      await expect(steps.getByText(label, { exact: true })).toBeVisible()
    }

    await expect(page.locator('input[value="TRAKT_JSON"]')).toBeVisible()
    await expect(page.locator('input[value="MAL_XML"]')).toBeVisible()
    await expect(page.locator('input[value="STEAM_EXPORT"]')).toBeVisible()
  })

  test('AC-7: an unauthenticated visit to /admin/import lands on /login', async ({
    page,
  }) => {
    test.skip(!process.env.ADMIN_PASS, 'The file-scope beforeAll requires ADMIN_PASS.')

    await page.goto('/admin/import')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})

test.describe('/admin/import seeded flow (Story 11.5 AC-10)', () => {
  // Both hooks, not just afterAll: a retry that follows a run which already
  // landed its rows would otherwise import 30 duplicates, and the summary would
  // read `0 ITEMS IMPORTED` while the test went green.
  test.beforeAll(async () => {
    await cleanupSeeded()
  })

  test.afterAll(async () => {
    // Drops the imported GAME rows by their reserved appid block, so a re-run
    // imports 30 fresh rows instead of reporting 30 duplicates.
    await cleanupSeeded()
  })

  test('AC-10: upload runs the import to its completion summary and links to /admin/merge', async ({
    page,
  }) => {
    // The default 30s cap cannot hold a login, three wizard steps and a worker
    // round trip against a dev server compiling each route on first visit. The
    // individual assertion timeouts below are what should fail, not the cap.
    test.setTimeout(90_000)

    const { buffer } = steamExportFixture(IMPORT_ROW_COUNT)

    await login(page)
    await page.goto('/admin/import')

    // Step 1: pick the Steam library export.
    await page.locator('input[value="STEAM_EXPORT"]').check()
    // exact: true, or the substring match also picks up the dev overlay's
    // "Open Next.js Dev Tools" button and trips strict mode.
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()

    // Step 2: upload the fixture and wait for the client preview.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'steam-owned-games.json',
      mimeType: 'application/json',
      buffer,
    })
    await expect(
      page.getByText(new RegExp(`${IMPORT_ROW_COUNT} ROWS DETECTED`)),
    ).toBeVisible({ timeout: 10_000 })
    // exact: true, or the substring match also picks up the dev overlay's
    // "Open Next.js Dev Tools" button and trips strict mode.
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()

    // Step 3: confirm.
    await page.getByRole('button', { name: 'START IMPORT' }).click()

    // Lands on the SSE status page. It mounts in its running phase, so the bar
    // is there, but a network-free 30-row import can finish before the browser
    // subscribes and the recovered terminal frame swaps in the summary within a
    // frame or two. Accept either: pinning the bar alone would be a coin flip.
    await expect(page).toHaveURL(/\/admin\/import\/[^/]+\/status/, {
      timeout: 15_000,
    })
    await expect(
      page.getByRole('progressbar').or(page.locator('.imp-summary')),
    ).toBeVisible({ timeout: 15_000 })

    // The worker drives the run to completion; the summary + CTA render. Pin
    // the count: a bare /ITEMS IMPORTED/ also matches `0 ITEMS IMPORTED`, which
    // is exactly what a duplicate-only run renders, so the loose form would go
    // green on a run that imported nothing.
    await expect(
      page.getByText(new RegExp(`${IMPORT_ROW_COUNT} ITEMS IMPORTED`)),
    ).toBeVisible({ timeout: IMPORT_COMPLETION_TIMEOUT_MS })
    await page.getByRole('link', { name: 'REVIEW MERGES' }).click()
    await expect(page).toHaveURL(/\/admin\/merge/, { timeout: 10_000 })
  })
})
