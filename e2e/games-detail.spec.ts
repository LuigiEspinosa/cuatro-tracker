import { expect, test, type APIRequestContext } from '@playwright/test'

// Story 9.5 AC-13: the /games/[id] detail page.
//
//   Scenario 1 (private-profile, canonical): a GAME whose
//   achievement_sync_status is 'private_profile' renders the
//   PrivateProfileBanner + the WAITING FOR FIRST SYNC placeholder INSTEAD of
//   the achievement list, and the hero WatchStatusControl still mutates end to
//   end. A live Steam 403 is not reproducible in CI, so this scenario is gated
//   on E2E_PRIVATE_PROFILE_GAME_ID: a GAME row pre-seeded and flipped to
//   achievement_sync_status='private_profile' out of band. It skips cleanly
//   when that fixture is absent.
//
//   Scenario 2 (404 smoke): an unknown id routes to the themed not-found page.
//   No TMDB/IGDB/Steam dependency, so it gates on ADMIN_PASS alone.

const ADMIN_PASS = process.env.ADMIN_PASS
const PRIVATE_GAME_ID = process.env.E2E_PRIVATE_PROFILE_GAME_ID

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('PASSWORD').fill(ADMIN_PASS!)
  await page.getByRole('button', { name: '> LOG IN' }).click()
  await page.waitForURL('/', { timeout: 10_000 })
}

async function setStatus(
  api: APIRequestContext,
  mediaItemId: string,
  status: string,
): Promise<void> {
  const res = await api.fetch('/api/progress', {
    method: 'PUT',
    data: { mediaItemId, status, completed_at: null },
  })
  expect(res.ok()).toBeTruthy()
}

test.describe('/games/[id] detail page (Story 9.5)', () => {
  test('AC-13: private-profile game shows the banner + placeholder, hides the achievement list, and the status control still mutates', async ({
    page,
  }) => {
    test.skip(
      !ADMIN_PASS || !PRIVATE_GAME_ID,
      'Requires ADMIN_PASS + E2E_PRIVATE_PROFILE_GAME_ID (a GAME row flipped to achievement_sync_status=private_profile out of band).',
    )

    await login(page)

    // Reset the entry status so selecting WATCHING below is a real transition
    // (the control no-ops when the next status equals the current one).
    const api = page.request
    await setStatus(api, PRIVATE_GAME_ID!, 'PLAN_TO_WATCH')

    await page.goto(`/games/${PRIVATE_GAME_ID}`)

    // The PrivateProfileBanner renders in place of the achievement list.
    await expect(page.getByText(/ACHIEVEMENTS LOCKED/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText(/WAITING FOR FIRST SYNC/i)).toBeVisible()
    // The achievement list itself is gated off the page in the private state.
    await expect(page.locator('.achievement-list')).toHaveCount(0)

    // The hero WatchStatusControl still mutates end to end
    // (PLAN TO WATCH -> WATCHING). Labels are the raw WatchStatus enum names;
    // the per-medium relabel (PLAYING) is deferred (Q-LABELS).
    await page.locator('.watch-status-control-button').click()
    await page.getByRole('option', { name: /WATCHING/ }).click()
    await expect(page.getByText(/STATUS.*WATCHING/i)).toBeVisible({
      timeout: 10_000,
    })

    // Restore the starting state so the fixture is reusable across runs.
    await setStatus(api, PRIVATE_GAME_ID!, 'PLAN_TO_WATCH')
  })

  test('returns the themed not-found page for an unknown game id', async ({
    page,
  }) => {
    test.skip(
      !ADMIN_PASS,
      'Requires ADMIN_PASS to authenticate. Asserts page chrome only.',
    )

    await login(page)

    await page.goto('/games/this-id-does-not-exist')
    await expect(page.getByText(/GAME NOT IN LIBRARY/i)).toBeVisible()
    await expect(
      page.getByRole('link', { name: /BACK TO GAMES LIBRARY/i }),
    ).toBeVisible()
  })
})
