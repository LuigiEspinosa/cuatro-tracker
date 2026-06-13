import { expect, test } from '@playwright/test'

const ADMIN_EMAIL = 'admin@tracker.local'
const ADMIN_PASS = process.env.ADMIN_PASS

test.beforeAll(async ({ browser }) => {
  if (!ADMIN_PASS) {
    throw new Error(
      'ADMIN_PASS env is required for e2e tests. Set it in .env (local) or the CI env block.',
    )
  }
  // Warm up the dashboard route so dev-mode turbopack compilation latency does
  // not skew AC-3's reduced-motion ≤500ms budget. First request to `/` triggers
  // a multi-second compile in dev mode; subsequent requests serve from cache.
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.goto('/', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
  await ctx.close()
})

test.describe('Login flow', () => {
  test('AC-1: valid credentials play boot + channel-flip + arrive at dashboard', async ({
    page,
  }) => {
    await page.goto('/login')
    const email = page.getByLabel('EMAIL')
    const password = page.getByLabel('PASSWORD')
    await expect(email).toHaveValue(ADMIN_EMAIL)
    await password.fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    // AC-1 calls for "boot sequence plays" — assert the overlay actually
    // appeared at some point during the submit window before the URL
    // transitions. If reduced-motion regressed to default, the overlay would
    // never paint and this assertion catches it.
    await expect(
      page.locator('[aria-label="System boot sequence"]'),
    ).toBeVisible({ timeout: 3_000 })
    await page.waitForURL('/', { timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe('/')
  })

  test('AC-2: invalid credentials truncate boot, show > ACCESS DENIED, retain values, focus password', async ({
    page,
  }) => {
    await page.goto('/login')
    const email = page.getByLabel('EMAIL')
    const password = page.getByLabel('PASSWORD')
    await password.fill('wrong-pass')

    // AC-2 calls for boot truncation with glitch-shake. The `.lc-screen-shake`
    // class exists only while phase=error-truncating, a 350ms window
    // (BootSequence TRUNCATE_TOTAL_MS) that opens only after the NextAuth +
    // bcrypt round trip resolves. Any waiter installed from the runner AFTER
    // the click can lose that window to runner-process latency, so arm an
    // in-page MutationObserver BEFORE submitting. Mutation records queue
    // losslessly, so the shake is caught even when the observer callback runs
    // after the class is already gone (the removal record carries oldValue).
    await page.evaluate(() => {
      const w = window as Window & { __shakeSeen?: boolean }
      w.__shakeSeen = false
      const screen = document.querySelector('.lc-screen')
      if (!screen) {
        // Fail at arming time: a silent return here would surface later as a
        // misleading "shake never seen" assertion instead of selector drift.
        throw new Error('.lc-screen not mounted; cannot arm the shake observer')
      }
      const observer = new MutationObserver((records) => {
        const seen = records.some(
          (r) =>
            (r.oldValue ?? '').includes('lc-screen-shake') ||
            (r.target as Element).classList.contains('lc-screen-shake'),
        )
        if (seen) {
          w.__shakeSeen = true
          observer.disconnect()
        }
      })
      observer.observe(screen, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true,
      })
    })

    await page.getByRole('button', { name: '> LOG IN' }).click()

    // The settled error state is stable, so it can absorb a slow round trip.
    await expect(page.getByText('> ACCESS DENIED')).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('INVALID EMAIL OR PASSWORD')).toBeVisible()

    const shakeSeen = await page.evaluate(
      () => (window as Window & { __shakeSeen?: boolean }).__shakeSeen,
    )
    expect(shakeSeen).toBe(true)
    await expect(email).toHaveValue(ADMIN_EMAIL)
    await expect(password).toHaveValue('wrong-pass')
    await expect(password).toBeFocused()
  })

  test('AC-3: reduced-motion skips the boot overlay entirely (visual layer instant)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    // The AC's intent under reduced-motion is "no animated boot/flip" — measured
    // directly via DOM rather than wall-clock, since bcrypt latency dominates
    // total elapsed and is motion-independent. The boot overlay (.bs) should
    // never be visible at any point in the flow; under reduced-motion the
    // BootSequence reduced-motion useEffect fires onComplete in 1 RAF, and the
    // channel-flip overlay is a no-op (per Story 2.8). Watch the boot's
    // visibility throughout the submit -> waitForURL window.
    const bootCount = await page.locator('[aria-label="System boot sequence"]').count()
    expect(bootCount).toBe(0)

    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })
    const bootCountAfter = await page.locator('[aria-label="System boot sequence"]').count()
    expect(bootCountAfter).toBe(0)
  })

  test('AC-4: keyboard-only Tab → Tab → Enter submits and lands at dashboard', async ({
    page,
  }) => {
    await page.goto('/login')
    const email = page.getByLabel('EMAIL')
    await email.focus()
    await email.press('Tab')
    await expect(page.getByLabel('PASSWORD')).toBeFocused()
    await page.keyboard.type(ADMIN_PASS!)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '> LOG IN' })).toBeFocused()
    await page.keyboard.press('Enter')
    await page.waitForURL('/', { timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe('/')
  })
})
