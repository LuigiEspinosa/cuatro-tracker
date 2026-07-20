import { expect, test, type Page } from '@playwright/test'

// Story 11.5 AC-10.
//   - Wizard render + unauth slices: runnable in CI. They need only ADMIN_PASS
//     (no worker, no seed helper), exactly as admin-dashboard / admin-merge do.
//   - Seeded import flow: GATED behind TIMELINE_E2E_SEEDED. It uploads a 100-row
//     Trakt fixture (generated in-spec and set via a buffer) and needs the
//     BullMQ worker running to drive the SSE progress to completion. The merge
//     CTA lands on /admin/merge; the actual merge candidates are Story 11.6.

const ADMIN_PASS = process.env.ADMIN_PASS
const SEEDED = !!process.env.TIMELINE_E2E_SEEDED

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

test.describe('/admin/import seeded flow (Story 11.5 AC-10, gated)', () => {
  test('AC-10: upload advances the progress bar to the completion summary and links to /admin/merge', async ({
    page,
  }) => {
    test.skip(!SEEDED, 'Requires TIMELINE_E2E_SEEDED and a running worker.')

    // 100 Trakt movie rows. The ids need not all resolve on TMDB: unresolved
    // rows count as failed, but progress still advances and the summary still
    // renders, which is what this flow asserts.
    const entries = Array.from({ length: 100 }, (_, i) => ({
      type: 'movie',
      watched_at: '2020-01-01T00:00:00.000Z',
      movie: { title: `Fixture ${i}`, ids: { tmdb: i + 1 } },
    }))
    const buffer = Buffer.from(JSON.stringify(entries), 'utf-8')

    await login(page)
    await page.goto('/admin/import')

    // Step 1: pick Trakt.
    await page.locator('input[value="TRAKT_JSON"]').check()
    await page.getByRole('button', { name: 'NEXT' }).click()

    // Step 2: upload the fixture and wait for the client preview.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'trakt-100.json',
      mimeType: 'application/json',
      buffer,
    })
    await expect(page.getByText(/100 ROWS DETECTED/)).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: 'NEXT' }).click()

    // Step 3: confirm.
    await page.getByRole('button', { name: 'START IMPORT' }).click()

    // Lands on the SSE status page with a live progress bar.
    await expect(page).toHaveURL(/\/admin\/import\/[^/]+\/status/, {
      timeout: 15_000,
    })
    await expect(page.getByRole('progressbar')).toBeVisible({ timeout: 15_000 })

    // The worker drives the run to completion; the summary + CTA render.
    await expect(page.getByText(/ITEMS IMPORTED/)).toBeVisible({
      timeout: 120_000,
    })
    await page.getByRole('link', { name: 'REVIEW MERGES' }).click()
    await expect(page).toHaveURL(/\/admin\/merge/, { timeout: 10_000 })
  })
})
