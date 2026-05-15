import { expect, test, type APIRequestContext } from '@playwright/test'

const ADMIN_PASS = process.env.ADMIN_PASS

async function getFirstMovieId(api: APIRequestContext): Promise<string> {
  const res = await api.get('/api/library?type=MOVIE&limit=5')
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { items: Array<{ mediaItemId: string }> }
  expect(body.items.length).toBeGreaterThan(0)
  return body.items[0].mediaItemId
}

async function resetEntry(
  api: APIRequestContext,
  mediaItemId: string,
): Promise<void> {
  const res = await api.fetch('/api/progress', {
    method: 'PUT',
    data: {
      mediaItemId,
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

test.describe('/movies/[id] detail page (Story 6.5)', () => {
  test('AC-8: WatchStatusControl flips status PLAN_TO_WATCH → COMPLETED and persists completed_at', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    const api = page.request
    const mediaItemId = await getFirstMovieId(api)
    await resetEntry(api, mediaItemId)

    await page.goto(`/movies/${mediaItemId}`)

    // Open the WatchStatusControl dropdown and select COMPLETED.
    await page
      .getByRole('button', { name: /PLAN TO WATCH/i, expanded: false })
      .click()
    await page.getByRole('option', { name: /COMPLETED/i }).click()
    await expect(page.getByText(/STATUS · COMPLETED/i)).toBeVisible({
      timeout: 5_000,
    })

    // Verify status persisted via the library list.
    const libRes = await api.get(`/api/library?type=MOVIE&limit=200`)
    const lib = (await libRes.json()) as {
      items: Array<{ mediaItemId: string; status: string }>
    }
    const updated = lib.items.find((i) => i.mediaItemId === mediaItemId)
    expect(updated?.status).toBe('COMPLETED')

    // Verify completed_at is non-null by re-PUTting and reading the response.
    const progressRes = await api.fetch('/api/progress', {
      method: 'PUT',
      data: { mediaItemId, status: 'COMPLETED' },
    })
    expect(progressRes.ok()).toBeTruthy()
    const progress = (await progressRes.json()) as {
      completedAt: string | null
    }
    expect(progress.completedAt).not.toBeNull()

    // Cleanup: reset back so re-running the test stays idempotent.
    await resetEntry(api, mediaItemId)
  })

  test('returns 404 for a non-existent movie id', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
    await page.getByRole('button', { name: '> LOG IN' }).click()
    await page.waitForURL('/', { timeout: 10_000 })

    await page.goto('/movies/this-id-does-not-exist')
    await expect(page.getByText(/MOVIE NOT IN LIBRARY/i)).toBeVisible()
    await expect(
      page.getByRole('link', { name: /BACK TO LIBRARY/i }),
    ).toBeVisible()
  })
})
