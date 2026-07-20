import { expect, test, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

// Story 11.4 AC-10.
//   - Empty-state scenario: runnable in CI. A freshly migrated + seeded test DB
//     has the admin user but zero MergeSuggestion rows, so /admin/merge shows
//     NO CANDIDATES. Needs only ADMIN_PASS.
//   - Seeded accept -> dismiss -> empty flow: GATED behind TIMELINE_E2E_SEEDED
//     (the same gate the timeline/grid specs use). It seeds its own rows via a
//     direct Prisma client (DATABASE_URL is loaded by playwright.config), so it
//     is self-contained when a developer opts in, and skipped in CI where the
//     populated-library seed helper does not run.

const ADMIN_PASS = process.env.ADMIN_PASS
const SEEDED = !!process.env.TIMELINE_E2E_SEEDED

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

test.describe('/admin/merge seeded flow (Story 11.4 AC-10, gated)', () => {
  const TAG = `e2e-merge-${Date.now()}`
  const prisma = new PrismaClient()
  const created: { sourceId: string; targetId: string; suggestionId: string }[] = []

  test.beforeAll(async () => {
    if (!SEEDED) return

    // Three source/target pairs, all with UserEntries so the accept path
    // exercises the conflict merge and we can assert the target entry survives.
    for (let i = 0; i < 3; i++) {
      const source = await prisma.mediaItem.create({
        data: {
          type: 'MOVIE',
          title: `${TAG} DUP ${i}`,
          release_date: new Date('2001-01-01T00:00:00Z'),
          user_entry: { create: { status: 'WATCHING', progress: 3 } },
        },
      })
      const target = await prisma.mediaItem.create({
        data: {
          type: 'MOVIE',
          title: `${TAG} CANON ${i}`,
          release_date: new Date('2001-01-01T00:00:00Z'),
          user_entry: { create: { status: 'COMPLETED', progress: 9 } },
        },
      })
      const suggestion = await prisma.mergeSuggestion.create({
        data: {
          source_id: source.id,
          target_id: target.id,
          // Descending confidence so the seeded rows sort ahead deterministically.
          confidence: 0.99 - i * 0.01,
        },
      })
      created.push({
        sourceId: source.id,
        targetId: target.id,
        suggestionId: suggestion.id,
      })
    }
  })

  test.afterAll(async () => {
    if (SEEDED) {
      // Deleting the MediaItems cascades their UserEntries and any surviving
      // MergeSuggestion rows. Sources may already be gone (accepted).
      const ids = created.flatMap((c) => [c.sourceId, c.targetId])
      await prisma.mediaItem.deleteMany({ where: { id: { in: ids } } })
    }
    await prisma.$disconnect()
  })

  test('AC-10: accept re-points and deletes, dismiss flags, queue reaches empty', async ({
    page,
  }) => {
    test.skip(!SEEDED, 'Requires TIMELINE_E2E_SEEDED to seed merge suggestions.')

    await login(page)
    await page.goto('/admin/merge')

    // Suggestion 1 (highest confidence) is shown first. Accept it.
    await expect(page.getByRole('button', { name: '> MERGE' })).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: '> MERGE' }).click()

    // The source MediaItem is deleted and the target's UserEntry survives.
    await expect(async () => {
      const source = await prisma.mediaItem.findUnique({
        where: { id: created[0].sourceId },
      })
      expect(source).toBeNull()
    }).toPass({ timeout: 5_000 })
    const targetEntry = await prisma.userEntry.findUnique({
      where: { media_item_id: created[0].targetId },
    })
    expect(targetEntry).not.toBeNull()

    // Suggestion 2 is now shown. Dismiss it.
    await expect(page.getByRole('button', { name: /CANCEL/ })).toBeVisible()
    await page.getByRole('button', { name: /CANCEL/ }).click()

    await expect(async () => {
      const dismissed = await prisma.mergeSuggestion.findUnique({
        where: { id: created[1].suggestionId },
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
