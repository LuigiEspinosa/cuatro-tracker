import { expect, test, type Page } from '@playwright/test'
import {
  cleanupSeeded,
  disconnectSeed,
  seedTimelineLibrary,
  type TimelineSeedResult,
} from './fixtures/library-seed'

// Story 10.4 AC-5 / AC-8, Story 10.5 AC-2, Story 10.6 AC-6, Story 10.7 AC-5.
// The empty-state scenario runs first against an unseeded baseline; every other
// describe seeds the shared populated library in beforeAll and drops it again in
// afterAll. Declaration order is the run order because playwright.config pins
// workers to 1, which is also what keeps this file's cleanup ahead of nothing
// (timeline runs last alphabetically) and every earlier spec's cleanup ahead of
// the LIBRARY EMPTY assertion below.

const ADMIN_PASS = process.env.ADMIN_PASS

test.beforeAll(async () => {
  if (!ADMIN_PASS) {
    throw new Error(
      'ADMIN_PASS env is required for e2e tests. Set it in .env (local) or the CI env block.',
    )
  }
})

// The only in-worker disconnect, and it lives here because timeline sorts last
// among the spec files. The other specs used to disconnect too, which closed a
// module singleton the rest of the run then reused and silently reconnected.
// If a spec file is ever added after this one alphabetically, it reconnects
// lazily rather than failing, so this stays a best-effort close.
test.afterAll(async () => {
  await disconnectSeed()
})

async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
  await page.getByRole('button', { name: '> LOG IN' }).click()
  await page.waitForURL('/', { timeout: 10_000 })
}

test.describe('/timeline empty library (Story 10.4)', () => {
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
})

test.describe('/timeline seeded library (Story 10.4, 10.5)', () => {
  test.beforeAll(async () => {
    await seedTimelineLibrary()
  })

  test.afterAll(async () => {
    await cleanupSeeded()
  })

  test('AC-8: a 1985-2025 library renders grouped by year and the band updates on scroll', async ({
    page,
  }) => {
    await login(page)
    await page.goto('/timeline')

    // Newest year first (release_desc default), shown in the sticky band.
    const band = page.locator('.syb .syb-year-incoming').first()
    await expect(band).toBeVisible()
    await expect(page.locator('a.tl-row').first()).toBeVisible()

    // Year sentinels span multiple decades.
    expect(await page.locator('[data-tl-year]').count()).toBeGreaterThan(1)

    // Scrolling to the bottom changes the active year the band displays. The
    // wheel is inside the poll, not before it: a single event fired while the
    // smooth-scroll layer is still coming up scrolls nothing, and no amount of
    // waiting afterwards recovers it.
    const firstYear = await band.textContent()
    await expect(async () => {
      await page.mouse.wheel(0, 20_000)
      const laterYear = await band.textContent()
      expect(laterYear).not.toBe(firstYear)
    }).toPass({ timeout: 10_000 })
  })

  test('AC-2: scrolling across a decade boundary ramps the era ground tint', async ({
    page,
  }) => {
    await login(page)
    await page.goto('/timeline')

    // Read the RESOLVED ground color off <body> (which paints
    // background: var(--ground-base)), not the raw --ground-base string. The
    // driver writes a var() reference first and resolved hexes per scroll tick,
    // so asserting on the custom property would pass on that var-to-hex format
    // flip alone. The computed color only changes when the tint crosses an era.
    const groundColor = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor.trim())

    await expect(page.locator('a.tl-row').first()).toBeVisible()
    const before = await groundColor()
    await expect(async () => {
      await page.mouse.wheel(0, 20_000)
      const after = await groundColor()
      expect(after).not.toBe(before)
    }).toPass({ timeout: 10_000 })
  })
})

test.describe('/timeline filter strip (Story 10.6)', () => {
  test.beforeAll(async () => {
    await seedTimelineLibrary()
  })

  test.afterAll(async () => {
    await cleanupSeeded()
  })

  test('AC-6: filter to MOVIES + TV, sort consumed asc, then RESET restores the full library', async ({
    page,
  }) => {
    await login(page)
    await page.goto('/timeline')

    const rows = page.locator('a.tl-row')
    const total = await rows.count()
    expect(total).toBeGreaterThan(0)

    // Deselect everything except MOVIES + TV via the media-type chips.
    for (const label of ['ANIME', 'MANGA', 'GAMES']) {
      await page.getByRole('button', { name: `Active filter: ${label}` }).click()
    }

    // Only movie + tv rows survive the scope.
    await expect(page.locator('a.tl-row[data-medium="anime"]')).toHaveCount(0)
    await expect(page.locator('a.tl-row[data-medium="manga"]')).toHaveCount(0)
    await expect(page.locator('a.tl-row[data-medium="games"]')).toHaveCount(0)
    const scoped = await rows.count()
    expect(scoped).toBeGreaterThan(0)
    expect(scoped).toBeLessThan(total)

    // Switch to CONSUMED ascending; the visible (non-dash) date column must be
    // non-descending. Null-consumed rows sink to the end and read as a dash.
    await page.getByRole('radio', { name: 'CONSUMED ↑' }).click()
    const dates = (await page.locator('.tl-date').allTextContents())
      .map((text) => text.trim())
      .filter((text) => text !== '-')
    expect(dates).toEqual([...dates].sort())

    // RESET clears the chips back to all-active and restores the full library.
    await page.getByRole('button', { name: '> RESET' }).click()
    await expect(rows).toHaveCount(total)
  })
})

test.describe('/timeline franchise mode (Story 10.7)', () => {
  let seed: TimelineSeedResult

  test.beforeAll(async () => {
    seed = await seedTimelineLibrary()
  })

  test.afterAll(async () => {
    await cleanupSeeded()
  })

  test('AC-5: toggle franchise mode collapses the seeded franchise to one expandable row', async ({
    page,
  }) => {
    await login(page)
    await page.goto('/timeline')

    // Toggle franchise mode on. The strip toggle's accessible name is FRANCHISE.
    await page.getByRole('button', { name: /FRANCHISE/ }).click()

    // Scope to the seeded group by its label: the summary row renders
    // franchise_id verbatim, so a developer's real library having franchises of
    // its own cannot break this assertion.
    const summary = page
      .locator('[data-franchise-summary]')
      .filter({ hasText: seed.franchiseId })
    await expect(summary).toHaveCount(1)
    expect(await page.locator('[data-franchise-child]').count()).toBe(0)

    // Expand: the seeded members render below, in release order.
    await summary.click()
    const children = page.locator('[data-franchise-child]')
    await expect(children).toHaveCount(seed.franchiseSize)
    const dates = (await children.locator('.tl-date').allTextContents())
      .map((text) => text.trim())
      .filter((text) => text !== '-')
    expect(dates).toEqual([...dates].sort())

    // Collapse: children are removed from the DOM (AC-4), not merely hidden.
    await summary.click()
    await expect(children).toHaveCount(0)
  })
})
