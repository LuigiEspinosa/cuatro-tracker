import { expect, test, type Page } from '@playwright/test'

// Story 10.4 AC-8.
//   - Empty-state scenario: runnable in CI. A freshly migrated + seeded test DB
//     has the admin user but no UserEntry rows, so /timeline shows LIBRARY EMPTY.
//     Needs only ADMIN_PASS (no external API).
//   - Seeded scenario: authored but GATED. The populated-library seed helper
//     does not exist yet (the same unlanded blocker as the dashboard + grid e2e,
//     see deferred-work.md). Mirrors how anime-grid / games-grid skip without
//     their prerequisites.

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

test.describe('/timeline (Story 10.4)', () => {
  test('AC-5: empty library shows LIBRARY EMPTY with an ADD AN ITEM CTA linking to search', async ({
    page,
  }) => {
    test.skip(!process.env.ADMIN_PASS, 'Requires ADMIN_PASS to authenticate.')

    await login(page)
    await page.goto('/timeline')

    await expect(page.getByText(/LIBRARY EMPTY/)).toBeVisible({ timeout: 10_000 })
    const cta = page.getByRole('button', { name: /ADD AN ITEM/ })
    await expect(cta).toBeVisible()
    await cta.click()
    await page.waitForURL('/search', { timeout: 10_000 })
  })

  test('AC-8 (gated): a 1985-2025 library renders grouped by year and the band updates on scroll', async ({
    page,
  }) => {
    test.skip(
      !process.env.TIMELINE_E2E_SEEDED,
      'Requires the populated-library seed helper (unlanded, see deferred-work.md).',
    )

    await login(page)
    await page.goto('/timeline')

    // Newest year first (release_desc default), shown in the sticky band.
    const band = page.locator('.syb .syb-year-incoming').first()
    await expect(band).toBeVisible()
    await expect(page.locator('a.tl-row').first()).toBeVisible()

    // Year sentinels span multiple decades.
    expect(await page.locator('[data-tl-year]').count()).toBeGreaterThan(1)

    // Scrolling to the bottom changes the active year the band displays.
    const firstYear = await band.textContent()
    await page.mouse.wheel(0, 20_000)
    await expect(async () => {
      const laterYear = await band.textContent()
      expect(laterYear).not.toBe(firstYear)
    }).toPass({ timeout: 3_000 })
  })
})
