import { expect, test } from '@playwright/test'

// Story 8.4 AC-9 / NFR49 canonical flow:
//   search anime -> add via federated POST /api/media -> grid renders -> keyboard nav.
//
// Skip-in-CI semantics match e2e/movies-detail.spec.ts: real ADMIN_PASS, real
// TMDB_API_KEY, AND live AniList reachability are all required. The federated
// search route calls both TMDB + AniList in parallel, so a stub TMDB key
// would surface partialFailure and make the assertions flaky.

const ADMIN_PASS = process.env.ADMIN_PASS

test.beforeAll(async () => {
  if (!ADMIN_PASS) {
    throw new Error(
      'ADMIN_PASS env is required for e2e tests. Set it in .env (local) or the CI env block.',
    )
  }
})

test.describe('/anime grid (Story 8.4)', () => {
  test('AC-9: search Frieren -> add via federated POST -> /anime renders card -> keyboard nav lands on detail route', async ({
    page,
  }) => {
    test.skip(
      process.env.TMDB_API_KEY === 'test' || !process.env.TMDB_API_KEY,
      'Requires real TMDB API key (federated search dispatches TMDB + AniList in parallel) and live AniList reachability.',
    )

    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    // Open search and type Frieren. The federated search route calls TMDB
    // plus AniList in parallel via Story 8.3's anilistAdapter.
    await page.goto('/search')
    await page.getByPlaceholder(/SEARCH/i).fill('Frieren')

    // Wait for at least one AniList anime result to appear. The AniList
    // section header renders with the small-caps 'ANIME' label per the
    // SECTION_LABELS map in GlobalSearch (Story 8.3).
    const animeRow = page
      .locator('[role="option"][data-medium="anime"]')
      .first()
    await expect(animeRow).toBeVisible({ timeout: 10_000 })

    // ⌘+Enter (mac) / Ctrl+Enter (other) adds to library directly from the
    // focused row (SearchResultRow.handleKeyDown line 75).
    await animeRow.focus()
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Enter`)

    // Wait for the ADD success toast (sonner). The toast description includes
    // the source + type per GlobalSearch.onSuccess (Story 5.4 / 8.3 wiring).
    await expect(page.getByText(/ADDED TO LIBRARY/i)).toBeVisible({
      timeout: 10_000,
    })

    // Navigate to /anime and assert the new card renders with the 35mm slide
    // mount chrome. `data-medium='anime'` is set on the inner card element
    // (LibraryGrid), so we target the `<li role="gridcell">` that CONTAINS
    // it via `:has()` rather than `[data-medium=...]` directly on the li.
    // Filter to entries by the just-added Frieren title so the test does
    // not depend on library order.
    await page.goto('/anime')
    const card = page
      .locator('li[role="gridcell"]:has([data-medium="anime"])')
      .filter({ hasText: /Frieren/i })
      .first()
    await expect(card).toBeVisible({ timeout: 5_000 })

    // Keyboard nav: focus the inner `<a>` (the focusable element inside the
    // grid cell; the outer <li> is not focusable and would not respond to
    // Enter), press Enter, assert the router navigated to /anime/[id]. The
    // detail page does not exist until Story 8.5, so the 404 page is the
    // acceptable destination (AC-6 explicitly allows this).
    await card.locator('a').first().focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/anime\/[^/]+$/, { timeout: 5_000 })
  })

  test('AC-5: empty state renders for a fresh library (anime medium)', async ({
    page,
  }) => {
    // This case is hard to test against a shared dev DB (the library may
    // already contain anime from a previous test run). Skipped unless the
    // CI env explicitly opts in via E2E_RESET_LIBRARY.
    test.skip(
      process.env.E2E_RESET_LIBRARY !== '1',
      'Empty-state test requires a freshly-reset library (set E2E_RESET_LIBRARY=1 to opt in).',
    )

    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    await page.goto('/anime')
    await expect(page.getByText(/NO ANIME IN LIBRARY/i)).toBeVisible()
    await expect(
      page.getByRole('link', { name: /ADD AN ANIME/i }),
    ).toBeVisible()
  })
})

test.describe('/manga grid (Story 8.4)', () => {
  test('manga page renders with the MANGA heading and item count', async ({
    page,
  }) => {
    test.skip(
      process.env.TMDB_API_KEY === 'test' || !process.env.TMDB_API_KEY,
      'Requires real TMDB key for the layout providers + auth gate.',
    )

    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    await page.goto('/manga')
    // Heading uses display-serif 'MANGA' noun within the ▓-block treatment.
    await expect(
      page.getByRole('heading', { name: /MANGA/i }).first(),
    ).toBeVisible()
    // The subtitle reads "{n} ITEMS" regardless of count.
    await expect(page.getByText(/^\s*\d+\s*ITEMS/i)).toBeVisible()
  })
})
