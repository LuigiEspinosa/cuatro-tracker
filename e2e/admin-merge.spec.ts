import { expect, test, type Page } from '@playwright/test'
import {
  cleanupSeeded,
  seedDb,
  seedMergePairs,
  type MergePairSeed,
} from './fixtures/library-seed'

// Story 11.4 AC-7 / AC-10. The empty-queue and unauth scenarios run against the
// unseeded baseline; the accept -> dismiss -> empty flow seeds three pairs
// through the shared helper and drops them again in afterAll. That cleanup is
// load-bearing: the fixture rows are dated 2001, so a survivor would show up on
// the timeline and break its LIBRARY EMPTY assertion later in the run.

const ADMIN_PASS = process.env.ADMIN_PASS
const MERGE_PAIR_COUNT = 3

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

test.describe('/admin/merge (Story 11.4)', () => {
  test('AC-7: empty queue shows NO CANDIDATES over NOTHING TO MERGE', async ({
    page,
  }) => {
    test.skip(!process.env.ADMIN_PASS, 'Requires ADMIN_PASS to authenticate.')

    await login(page)
    await page.goto('/admin/merge')

    await expect(page.getByText('NO CANDIDATES')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('NOTHING TO MERGE')).toBeVisible()
    await expect(
      page.getByText('Run a bulk import or wait for the next scheduled scan.'),
    ).toBeVisible()
  })

  test('AC-7: an unauthenticated visit to /admin/merge lands on /login', async ({
    page,
  }) => {
    test.skip(!process.env.ADMIN_PASS, 'The file-scope beforeAll requires ADMIN_PASS.')

    await page.goto('/admin/merge')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})

test.describe('/admin/merge seeded flow (Story 11.4 AC-10)', () => {
  let pairs: MergePairSeed[]

  test.beforeAll(async () => {
    pairs = await seedMergePairs(MERGE_PAIR_COUNT)
  })

  test.afterAll(async () => {
    await cleanupSeeded()
  })

  test('AC-10: accept re-points and deletes, dismiss flags, queue reaches empty', async ({
    page,
  }) => {
    await login(page)
    await page.goto('/admin/merge')

    // ! Confirm the queue head IS the fixture before clicking MERGE. The page
    // ! orders every unresolved suggestion by confidence descending across the
    // ! whole table, so on a developer's populated database a real pair scoring
    // ! above the fixture's 0.99 would sit first, and MERGE permanently deletes
    // ! the source MediaItem. This assertion is the only thing standing between
    // ! the accept path and a real library.
    await expect(page.getByRole('button', { name: '> MERGE' })).toBeVisible({
      timeout: 10_000,
    })
    // ! Scoped to the pane headings, not bare text. Each title renders TWICE on
    // ! this page: once as the pane's h2, and again inside the Title diff row,
    // ! which splits into SOURCE and TARGET spans precisely because the two
    // ! titles differ. A bare getByText matches both and trips Playwright's
    // ! strict mode, which reads as a failed assertion rather than an ambiguous
    // ! one.
    await expect(
      page.getByRole('heading', { name: 'E2E MERGE DUP 0001' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'E2E MERGE CANON 0001' }),
    ).toBeVisible()
    await page.getByRole('button', { name: '> MERGE' }).click()

    // The source MediaItem is deleted and the target's UserEntry survives.
    await expect(async () => {
      const source = await seedDb.mediaItem.findUnique({
        where: { id: pairs[0].sourceId },
      })
      expect(source).toBeNull()
    }).toPass({ timeout: 5_000 })
    const targetEntry = await seedDb.userEntry.findUnique({
      where: { media_item_id: pairs[0].targetId },
    })
    expect(targetEntry).not.toBeNull()

    // Suggestion 2 is now shown. Dismiss it.
    await expect(page.getByRole('button', { name: /CANCEL/ })).toBeVisible()
    await page.getByRole('button', { name: /CANCEL/ }).click()

    await expect(async () => {
      const dismissed = await seedDb.mergeSuggestion.findUnique({
        where: { id: pairs[1].suggestionId },
      })
      expect(dismissed?.dismissed).toBe(true)
      expect(dismissed?.resolved).toBe(true)
    }).toPass({ timeout: 5_000 })

    // Suggestion 3 remains; dismiss it to empty the queue and land on the
    // NO CANDIDATES state.
    await page.getByRole('button', { name: /CANCEL/ }).click()
    await expect(page.getByText('NO CANDIDATES')).toBeVisible({ timeout: 5_000 })
  })
})
