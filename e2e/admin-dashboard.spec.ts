import { expect, test, type Page } from '@playwright/test'

// Story 11.3 AC-7. Fully CI-runnable, no *_E2E_SEEDED gate: every assertion
// holds against a freshly migrated + seeded test DB (the admin user, zero
// MergeSuggestion rows). Zero pending suggestions is a real, assertable state,
// so this spec does not inherit the unlanded populated-library seed helper.
// Tile hrefs are asserted rather than clicked through: /admin/merge and
// /admin/import 404 until Stories 11.4 and 11.5 create them.

const ADMIN_PASS = process.env.ADMIN_PASS

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

test.describe('/admin dashboard (Story 11.3)', () => {
  test('AC-7: renders both tool tiles with their subtitles and hrefs', async ({
    page,
  }) => {
    test.skip(!process.env.ADMIN_PASS, 'Requires ADMIN_PASS to authenticate.')

    await login(page)
    await page.goto('/admin')

    const mergeTile = page.getByRole('link', { name: /MERGE TOOL/ })
    const importTile = page.getByRole('link', { name: /BULK IMPORT WIZARD/ })

    await expect(mergeTile).toBeVisible({ timeout: 10_000 })
    await expect(importTile).toBeVisible()

    // The merge count is a live db.mergeSuggestion.count read and the seeded DB
    // has no rows, so this pins the count to DB state. A looser /PENDING/ would
    // pass against a hardcoded string.
    await expect(mergeTile).toContainText('0 PENDING SUGGESTIONS')
    await expect(importTile).toContainText('NO ACTIVE IMPORTS')

    await expect(mergeTile).toHaveAttribute('href', '/admin/merge')
    await expect(importTile).toHaveAttribute('href', '/admin/import')
  })

  // This scenario never authenticates. The skip tracks the file-scope beforeAll,
  // which throws without ADMIN_PASS and would fail this test before it ran.
  test('AC-7: an unauthenticated visit to /admin lands on /login', async ({
    page,
  }) => {
    test.skip(!process.env.ADMIN_PASS, 'The file-scope beforeAll requires ADMIN_PASS.')

    await page.goto('/admin')

    // withAuth appends a callbackUrl query param, so match the path loosely.
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
