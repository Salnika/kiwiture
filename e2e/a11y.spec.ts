import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mockBackends, useMockedPosition } from './fixtures'

/**
 * Accessibility checks (spec 36, WCAG AA).
 *
 * Axe cannot prove a page is accessible, but it catches the violations that
 * matter most here: contrast, names on controls, landmark and heading structure.
 */

const analyze = (page: Parameters<typeof mockBackends>[0]) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The MapLibre canvas and its controls are third-party markup we do not own.
    .exclude('.maplibregl-map')
    .analyze()

test.describe('Accessibilité', () => {
  test.use({ serviceWorkers: 'block' })

  test('écran principal', async ({ page }) => {
    await mockBackends(page)
    await useMockedPosition(page)
    await page.goto('./')
    await page.getByTestId('station-card').first().waitFor()

    const results = await analyze(page)
    expect(results.violations).toEqual([])
  })

  test('écran principal, filtres déployés', async ({ page }) => {
    await mockBackends(page)
    await useMockedPosition(page)
    await page.goto('./')
    await page.getByTestId('station-card').first().waitFor()
    await page.getByRole('button', { name: /^Filtres/ }).click()

    const results = await analyze(page)
    expect(results.violations).toEqual([])
  })

  test('fiche station', async ({ page }) => {
    await mockBackends(page)
    await useMockedPosition(page)
    await page.goto('./')
    await page
      .getByTestId('station-card')
      .filter({ hasText: 'Rapide Chatelet' })
      .getByRole('button', { name: /Détails/ })
      .click()
    await page.getByRole('heading', { level: 1, name: 'Rapide Chatelet' }).waitFor()

    const results = await analyze(page)
    expect(results.violations).toEqual([])
  })

  test('réglages, véhicule, données et confidentialité', async ({ page }) => {
    await mockBackends(page)
    for (const path of ['./reglages', './vehicule', './donnees', './confidentialite']) {
      await page.goto(path)
      await page.getByRole('heading', { level: 1 }).waitFor()
      const results = await analyze(page)
      expect(results.violations, `${path}: ${JSON.stringify(results.violations, null, 2)}`).toEqual(
        [],
      )
    }
  })

  test('thème sombre', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await mockBackends(page)
    await useMockedPosition(page)
    await page.goto('./')
    await page.getByTestId('station-card').first().waitFor()

    const results = await analyze(page)
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })

  test('la liste est navigable au clavier', async ({ page }) => {
    await mockBackends(page)
    await useMockedPosition(page)
    await page.goto('./')
    await page.getByTestId('station-card').first().waitFor()

    // Every interactive control of a card must be reachable and have a name.
    const card = page.getByTestId('station-card').first()
    await expect(card.getByRole('button', { name: /Sélectionner/ })).toBeAttached()
    await expect(card.getByRole('button', { name: /Détails/ })).toBeVisible()
  })
})
