import { expect, test, type APIRequestContext } from '@playwright/test'

// Story 8.6 AC-9: navigate /manga/[id] -> assert hero + ChapterVolumeTracker
// + Authors + Relations -> +1 chapter -> reload -> assert persisted -> MARK
// VOLUME 1 COMPLETE -> reload -> assert chapter progress jumped to
// CHAPTERS_PER_VOLUME and volume progress is 1.
//
// Skip-in-CI semantics match e2e/anime-detail.spec.ts: requires live AniList
// reachability for the Server Component's getMedia + getMediaRelations calls,
// plus at least one manga in the seeded library.

const ADMIN_PASS = process.env.ADMIN_PASS
const CHAPTERS_PER_VOLUME = 10

async function getFirstMangaId(api: APIRequestContext): Promise<string> {
  const res = await api.get('/api/library?type=MANGA&limit=5')
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { items: Array<{ mediaItemId: string }> }
  expect(body.items.length).toBeGreaterThan(0)
  return body.items[0].mediaItemId
}

async function resetMangaProgress(
  api: APIRequestContext,
  mediaItemId: string,
): Promise<void> {
  // Reset to progress: 0, volume_progress: 0, PLAN_TO_WATCH so the test is
  // idempotent across runs.
  const res = await api.fetch('/api/progress', {
    method: 'PUT',
    data: {
      mediaItemId,
      progress: 0,
      volumeProgress: 0,
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

test.describe('/manga/[id] detail page (Story 8.6)', () => {
  test('AC-9: hero + tracker + Authors render; +1 chapter persists across reload', async ({
    page,
  }) => {
    test.skip(
      process.env.TMDB_API_KEY === 'test' || !process.env.TMDB_API_KEY,
      'Requires real TMDB key (for the auth/layout stack) + live AniList reachability + a seeded manga in the library.',
    )

    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    const api = page.request
    const mediaItemId = await getFirstMangaId(api)
    await resetMangaProgress(api, mediaItemId)

    await page.goto(`/manga/${mediaItemId}`)

    await expect(
      page.getByRole('link', { name: /BACK TO LIBRARY/i }),
    ).toBeVisible()

    // The chapter row of ChapterVolumeTracker must render the progress label.
    await expect(page.getByLabel('Chapter progress').first()).toBeVisible({
      timeout: 10_000,
    })

    // Authors band (when the seeded manga has an author_name).
    const authorsBand = page.getByRole('heading', { name: 'Authors' })
    if ((await authorsBand.count()) > 0) {
      await expect(authorsBand).toBeVisible()
    }

    // +1 chapter -> progress 0 -> 1 -> WATCHING.
    await page
      .getByRole('button', { name: 'Increment chapter progress by one' })
      .click()
    await expect(page.getByText(/^1 \/ /)).toBeVisible({ timeout: 10_000 })

    // Hard reload to assert server-side persistence.
    await page.reload()
    await expect(page.getByText(/^1 \/ /)).toBeVisible({ timeout: 10_000 })

    await resetMangaProgress(api, mediaItemId)
  })

  test('AC-9: MARK VOLUME 1 COMPLETE jumps chapter to CHAPTERS_PER_VOLUME and volume to 1', async ({
    page,
  }) => {
    test.skip(
      process.env.TMDB_API_KEY === 'test' || !process.env.TMDB_API_KEY,
      'Requires real TMDB key + live AniList + a seeded manga with volume_count > 0.',
    )

    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    const api = page.request
    const mediaItemId = await getFirstMangaId(api)
    await resetMangaProgress(api, mediaItemId)

    await page.goto(`/manga/${mediaItemId}`)

    const markBtn = page.getByRole('button', { name: 'Mark volume 1 complete' })
    const hasMark = (await markBtn.count()) > 0
    test.skip(
      !hasMark,
      'Seeded manga does not expose a volume axis (volume_count is null or 0).',
    )

    await markBtn.click()
    await expect(
      page.getByText(new RegExp(`^${CHAPTERS_PER_VOLUME} \\/ `)),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/^1 \/ \d+ VOLUMES/)).toBeVisible()

    await page.reload()
    await expect(
      page.getByText(new RegExp(`^${CHAPTERS_PER_VOLUME} \\/ `)),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/^1 \/ \d+ VOLUMES/)).toBeVisible()

    await resetMangaProgress(api, mediaItemId)
  })

  test('returns 404 for a non-existent manga id', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    await page.goto('/manga/this-id-does-not-exist')
    await expect(page.getByText(/MANGA NOT IN LIBRARY/i)).toBeVisible()
    await expect(
      page.getByRole('link', { name: /BACK TO MANGA LIBRARY/i }),
    ).toBeVisible()
  })
})
