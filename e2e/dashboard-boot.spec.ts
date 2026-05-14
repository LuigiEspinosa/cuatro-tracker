import { expect, test } from '@playwright/test'

const ADMIN_EMAIL = 'admin@tracker.local'
const ADMIN_PASS = process.env.ADMIN_PASS

test.beforeAll(async ({ browser }) => {
  if (!ADMIN_PASS) {
    throw new Error(
      'ADMIN_PASS env is required for e2e tests. Set it in .env (local) or the CI env block.',
    )
  }
  // Mirror login.spec.ts: warm up `/login` + `/` so dev-mode turbopack compile
  // latency doesn't poison the timing-sensitive assertions below.
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.goto('/', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
  await ctx.close()
})

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  const email = page.getByLabel('EMAIL')
  const password = page.getByLabel('PASSWORD')
  await expect(email).toHaveValue(ADMIN_EMAIL)
  await password.fill(ADMIN_PASS!)
  await page.getByRole('button', { name: '> LOG IN' }).click()
  await page.waitForURL('/', { timeout: 10_000 })
}

test.describe('Dashboard first-load boot gate (Story 5.5)', () => {
  test('AC-1+AC-2: first load plays boot; reload skips it', async ({ page, context }) => {
    await context.clearCookies()
    await signIn(page)
    // Belt-and-braces: clear localStorage AFTER landing on / so the page-side
    // gate sees a missing flag on first paint. (signIn already navigates to /
    // and may have committed the flag in that first paint; clearing now resets.)
    await page.evaluate(() => window.localStorage.removeItem('boot.played'))
    await page.reload()

    // First-load: overlay must appear and then dismiss within the boot duration.
    const overlay = page.locator('[aria-label="System boot sequence"]')
    await expect(overlay).toBeVisible({ timeout: 3_000 })
    await expect(overlay).toBeHidden({ timeout: 5_000 })

    // After the boot dismisses, localStorage carries a recent timestamp.
    const stamp = await page.evaluate(() => window.localStorage.getItem('boot.played'))
    expect(stamp).not.toBeNull()
    expect(Number.isFinite(Number(stamp))).toBe(true)

    // Reload: overlay must NOT appear within the same 1s window.
    await page.reload()
    await expect(overlay).toHaveCount(0, { timeout: 1_000 })
  })

  test('AC-3: reduced-motion bypasses the boot and still commits boot.played', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await signIn(page)
    await page.evaluate(() => window.localStorage.removeItem('boot.played'))
    await page.reload()

    const overlay = page.locator('[aria-label="System boot sequence"]')
    await expect(overlay).toHaveCount(0, { timeout: 1_000 })

    const stamp = await page.evaluate(() => window.localStorage.getItem('boot.played'))
    expect(stamp).not.toBeNull()
  })
})
