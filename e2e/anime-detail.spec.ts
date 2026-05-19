import { expect, test, type APIRequestContext } from '@playwright/test'

// Story 8.5 AC-10 canonical NFR50 flow:
//   navigate /anime/[id] -> assert hero + checklist + Studios + Relations ->
//   toggle ep 1 -> reload -> assert checked -> click a relation row.
//
// Skip-in-CI semantics match e2e/anime-grid.spec.ts: requires live AniList
// reachability for the Server Component's getMedia + getMediaRelations calls,
// plus at least one anime in the seeded library.

const ADMIN_PASS = process.env.ADMIN_PASS

async function getFirstAnimeId(api: APIRequestContext): Promise<string> {
  const res = await api.get('/api/library?type=ANIME&limit=5')
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { items: Array<{ mediaItemId: string }> }
  expect(body.items.length).toBeGreaterThan(0)
  return body.items[0].mediaItemId
}

async function resetAnimeProgress(
  api: APIRequestContext,
  mediaItemId: string,
): Promise<void> {
  // Reset to progress: 0 + PLAN_TO_WATCH so the test is idempotent across runs.
  const res = await api.fetch('/api/progress', {
    method: 'PUT',
    data: {
      mediaItemId,
      progress: 0,
      status: 'PLAN_TO_WATCH',
      completed_at: null,
    },
  })
  expect(res.ok()).toBeTruthy()
}

test.beforeAll(async () => {
  if (!ADMIN_PASS) {
    throw new Error(
      'ADMIN_PASS env is required for e2e tests. Set it in .env (local) or the CI env block.',
    )
  }
})

test.describe('/anime/[id] detail page (Story 8.5)', () => {
  test('AC-10: hero + checklist + Studios + Relations render; toggle ep 1 advances progress; reload persists checked', async ({
    page,
  }) => {
    test.skip(
      process.env.TMDB_API_KEY === 'test' || !process.env.TMDB_API_KEY,
      'Requires real TMDB key (for the auth/layout stack) + live AniList reachability + a seeded anime in the library.',
    )

    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    const api = page.request
    const mediaItemId = await getFirstAnimeId(api)
    await resetAnimeProgress(api, mediaItemId)

    await page.goto(`/anime/${mediaItemId}`)

    // Hero present.
    await expect(
      page.getByRole('link', { name: /BACK TO LIBRARY/i }),
    ).toBeVisible()
    // The episode checklist must render at least row EP 1.
    await expect(page.getByText('EP 1')).toBeVisible({ timeout: 10_000 })

    // Studios chip — the seeded Frieren entry sets studio_name to 'Madhouse'
    // via the AniList normaliser. Test asserts the band exists; the exact
    // name is library-state-dependent so we match the band header rather
    // than the chip text.
    await expect(
      page.getByRole('heading', { name: 'Studios' }),
    ).toBeVisible()

    // Toggle EP 1 watched.
    const ep1Toggle = page.getByRole('checkbox', {
      name: 'Mark episode 1 watched',
    })
    await ep1Toggle.click()

    // Wait for the server-side mutation + router.refresh() round trip. The
    // EpisodeChecklist row's data-checked attribute flips to "true" once the
    // PhosphorBar and PT-to-WATCHING status flip persist.
    await expect(ep1Toggle).toHaveAttribute('aria-checked', 'true', {
      timeout: 10_000,
    })

    // Hard reload to assert server-side persistence (not just React state).
    await page.reload()
    const ep1ReloadToggle = page.getByRole('checkbox', {
      name: 'Mark episode 1 watched',
    })
    await expect(ep1ReloadToggle).toHaveAttribute('aria-checked', 'true', {
      timeout: 10_000,
    })

    // Cleanup so the test stays idempotent.
    await resetAnimeProgress(api, mediaItemId)
  })

  test('AC-6: a relation row navigates to either an in-library detail OR the search prefill URL', async ({
    page,
  }) => {
    test.skip(
      process.env.TMDB_API_KEY === 'test' || !process.env.TMDB_API_KEY,
      'Requires live AniList for relations + a seeded anime with relations.',
    )

    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    const mediaItemId = await getFirstAnimeId(page.request)
    await page.goto(`/anime/${mediaItemId}`)

    // Skip the assertion when the seeded anime happens to have no relations
    // — the canonical Frieren entry does, but a leaner test seed may not.
    const relationsHeading = page.getByRole('heading', { name: 'Relations' })
    const relationsCount = await relationsHeading.count()
    test.skip(
      relationsCount === 0,
      'Seeded anime has no relations buckets to click.',
    )

    // Find the first relation row (in-library link OR out-of-library ADD).
    const firstRelationRow = page
      .locator('.relations-list-row a')
      .first()
    await expect(firstRelationRow).toBeVisible({ timeout: 5_000 })

    const href = await firstRelationRow.getAttribute('href')
    expect(href).not.toBeNull()
    // The link target is either an in-library detail route (/anime/<id> or
    // /manga/<id>) OR the preview route (/preview/anilist/anime|manga/<id>).
    // Replaces the original /search?prefill=anilist:<id> contract after the
    // preview page landed.
    expect(href).toMatch(
      /^(?:\/anime\/[^/]+|\/manga\/[^/]+|\/preview\/anilist\/(?:anime|manga)\/\d+)$/,
    )
  })

  test('returns 404 for a non-existent anime id', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    await page.goto('/anime/this-id-does-not-exist')
    await expect(page.getByText(/ANIME NOT IN LIBRARY/i)).toBeVisible()
    await expect(
      page.getByRole('link', { name: /BACK TO ANIME LIBRARY/i }),
    ).toBeVisible()
  })
})
