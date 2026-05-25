import { expect, test } from '@playwright/test'

// Story 9.4 AC-10 / NFR49 canonical flow:
//   search game -> add via federated POST /api/media -> /games grid renders -> keyboard nav.
//
// Skip-in-CI semantics match e2e/anime-grid.spec.ts: real ADMIN_PASS, real
// TMDB_API_KEY, AND live IGDB reachability (Twitch OAuth + IGDB v4) are all
// required. The federated search route calls TMDB + AniList + IGDB in
// parallel, so a stub TMDB key would surface partialFailure and make the
// assertions flaky.

const ADMIN_PASS = process.env.ADMIN_PASS

test.beforeAll(async () => {
  if (!ADMIN_PASS) {
    throw new Error(
      'ADMIN_PASS env is required for e2e tests. Set it in .env (local) or the CI env block.',
    )
  }
})

test.describe('/games grid (Story 9.4)', () => {
  test('AC-10: search Hollow Knight -> add via federated POST -> /games renders card -> keyboard nav lands on detail route', async ({
    page,
  }) => {
    test.skip(
      process.env.TMDB_API_KEY === 'test' || !process.env.TMDB_API_KEY,
      'Requires real TMDB API key (federated search dispatches TMDB + AniList + IGDB in parallel) and live IGDB reachability.',
    )

    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    // Open search and type Hollow Knight. The federated search route calls
    // TMDB + AniList + IGDB in parallel via Story 9.4's igdbAdapter.
    await page.goto('/search')
    await page.getByPlaceholder(/SEARCH/i).fill('Hollow Knight')

    // Wait for at least one IGDB game result to appear. The IGDB section
    // renders with the small-caps 'GAME' label per the SECTION_LABELS map in
    // GlobalSearch.
    const gameRow = page
      .locator('[role="option"][data-medium="game"]')
      .first()
    await expect(gameRow).toBeVisible({ timeout: 10_000 })

    // ⌘+Enter (mac) / Ctrl+Enter (other) adds to library directly from the
    // focused row (SearchResultRow.handleKeyDown).
    await gameRow.focus()
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Enter`)

    // Wait for the ADD success toast (sonner). The toast description includes
    // the source + type per GlobalSearch.onSuccess.
    await expect(page.getByText(/ADDED TO LIBRARY/i)).toBeVisible({
      timeout: 10_000,
    })

    // Navigate to /games and assert the new card renders with the arcade-
    // marquee chrome. `data-medium='games'` is set on the inner card element
    // (LibraryGrid), so we target the `<li role="gridcell">` that CONTAINS
    // it via `:has()` rather than `[data-medium=...]` directly on the li.
    // Filter to entries by the just-added Hollow Knight title so the test
    // does not depend on library order.
    await page.goto('/games')
    const card = page
      .locator('li[role="gridcell"]:has([data-medium="games"])')
      .filter({ hasText: /Hollow Knight/i })
      .first()
    await expect(card).toBeVisible({ timeout: 5_000 })

    // Keyboard nav: focus the inner `<a>` (the focusable element inside the
    // grid cell; the outer <li> is not focusable and would not respond to
    // Enter), press Enter, assert the router navigated to /games/[id]. The
    // detail page does not exist until Story 9.5, so the 404 page is the
    // acceptable destination (AC-10 explicitly allows this).
    await card.locator('a').first().focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/games\/[^/]+$/, { timeout: 5_000 })
  })
})

test.describe('/games grid smoke (Story 9.4)', () => {
  test('games page renders with the GAMES heading and item count', async ({
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

    await page.goto('/games')
    // Heading uses display-serif 'GAMES' noun within the ▓-block treatment.
    await expect(
      page.getByRole('heading', { name: /GAMES/i }).first(),
    ).toBeVisible()
    // The subtitle reads "{n} ITEMS" regardless of count.
    await expect(page.getByText(/^\s*\d+\s*ITEMS/i)).toBeVisible()
  })
})
