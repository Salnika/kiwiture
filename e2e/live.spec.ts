import { expect, test } from '@playwright/test'

/**
 * Smoke test against the real public APIs (data.gouv, BAN, OSRM, CARTO).
 *
 * Skipped by default: it depends on third-party availability and rate limits.
 * Run it deliberately with `E2E_LIVE=1 npm run test:e2e -- --grep @live`.
 */
test.describe('@live', () => {
  test.skip(!process.env.E2E_LIVE, 'Set E2E_LIVE=1 to run against the real APIs.')
  test.setTimeout(120_000)

  test('charge de vraies bornes IRVE autour de Paris', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 })

    await page.goto('./')

    await expect(page.getByTestId('station-card').first()).toBeVisible({ timeout: 60_000 })
    const count = await page.getByTestId('station-card').count()
    expect(count).toBeGreaterThan(3)

    await expect(page.getByText('Source', { exact: false }).first()).toBeVisible()
  })
})
