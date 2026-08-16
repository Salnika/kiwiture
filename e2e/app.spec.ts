import { expect, test } from '@playwright/test'
import { mockBackends, useMockedPosition } from './fixtures'

/** Critical E2E scenarios (spec 47). */

/**
 * The service worker is blocked for most scenarios: it intercepts cross-origin
 * requests (map tiles and styles) before Playwright's route mocks can, so the
 * basemap would try to reach the real network. The offline scenario re-enables
 * it explicitly, since that is precisely what it tests.
 */
test.describe('Kiwiture', () => {
  test.use({ serviceWorkers: 'block' })

  test('Scénario 1 — position autorisée, liste, détail', async ({ page }) => {
    await mockBackends(page)
    await useMockedPosition(page)

    await page.goto('./')

    const cards = page.getByTestId('station-card')
    await expect(cards.first()).toBeVisible()
    await expect(cards).toHaveCount(4)

    // A parsed price is shown as €/kWh…
    await expect(page.getByText('0,49 €/kWh').first()).toBeVisible()
    // …and an ambiguous one stays explicitly unavailable (spec 44).
    await expect(page.getByText('Prix non disponible').first()).toBeVisible()

    await page
      .getByTestId('station-card')
      .filter({ hasText: 'Rapide Chatelet' })
      .getByRole('button', { name: /Détails/ })
      .click()

    await expect(page.getByRole('heading', { level: 1, name: 'Rapide Chatelet' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Information tarifaire publiée' })).toBeVisible()
    await expect(page.getByText('Source : Base nationale IRVE')).toBeVisible()
  })

  test('Scénario 2 — géolocalisation refusée puis recherche d’adresse', async ({ page }) => {
    await mockBackends(page)
    // No geolocation permission granted: the browser denies the request.

    await page.goto('./')

    const originInput = page.getByRole('combobox', {
      name: /Ma position ou une adresse de départ/i,
    })
    await originInput.fill('Paris')

    const option = page.getByRole('option', { name: /^Paris/ }).first()
    await expect(option).toBeVisible()
    await option.click()

    await expect(page.getByTestId('station-card').first()).toBeVisible()
  })

  test('Scénario 3 — filtres CCS et ≥ 100 kW', async ({ page }) => {
    await mockBackends(page)
    await useMockedPosition(page)
    await page.goto('./')

    await expect(page.getByTestId('station-card')).toHaveCount(4)

    await page.getByRole('button', { name: 'CCS', exact: true }).first().click()
    await expect(page.getByTestId('station-card')).toHaveCount(2)

    await page.getByRole('button', { name: '≥ 100 kW' }).first().click()
    const cards = page.getByTestId('station-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.filter({ hasText: 'Mairie recharge gratuite' })).toHaveCount(0)
    await expect(cards.filter({ hasText: 'Centre commercial Test' })).toHaveCount(0)
  })

  test('Scénario 4 — estimation du coût pour une quantité d’énergie', async ({ page }) => {
    await mockBackends(page)
    await useMockedPosition(page)
    await page.goto('./')

    await expect(page.getByTestId('station-card').first()).toBeVisible()

    const energy = page.getByLabel('Énergie à ajouter')
    await energy.fill('30')
    await energy.blur()

    // 30 kWh × 0,49 €/kWh = 14,70 €, displayed as an estimate.
    await expect(page.getByText('≈ 14,70 € pour 30 kWh')).toBeVisible()

    await energy.fill('50')
    await energy.blur()
    await expect(page.getByText('≈ 24,50 € pour 50 kWh')).toBeVisible()
  })

  test('Scénario 5 — panne de routing, repli sur le vol d’oiseau', async ({ page }) => {
    await mockBackends(page, { breakRouting: true })
    await useMockedPosition(page)
    await page.goto('./')

    await expect(page.getByTestId('station-card').first()).toBeVisible()
    await expect(page.getByText(/à vol d'oiseau/).first()).toBeVisible()
    await expect(page.getByText('Distance routière indisponible').first()).toBeVisible()
  })

  test('la source des données et la limite de prix sont expliquées', async ({ page }) => {
    await mockBackends(page)
    await page.goto('./donnees')

    await expect(page.getByRole('heading', { name: 'Données et limites' })).toBeVisible()
    await expect(page.getByText(/champ de texte libre/)).toBeVisible()
  })

  test('les liens de navigation externe pointent vers les bonnes applications', async ({ page }) => {
    await mockBackends(page)
    await useMockedPosition(page)
    await page.goto('./')

    await page
      .getByTestId('station-card')
      .filter({ hasText: 'Rapide Chatelet' })
      .getByRole('button', { name: /Détails/ })
      .click()

    await expect(page.getByTestId('nav-google-maps')).toHaveAttribute(
      'href',
      /google\.com\/maps\/dir/,
    )
    await expect(page.getByTestId('nav-waze')).toHaveAttribute('href', /waze\.com\/ul/)
    await expect(page.getByTestId('nav-apple-maps')).toHaveAttribute('href', /maps\.apple\.com/)
  })

  test('aucun jeton secret n’est présent dans le bundle', async ({ page }) => {
    const scripts: string[] = []
    page.on('response', async (response) => {
      const url = response.url()
      if (url.endsWith('.js') && response.request().resourceType() === 'script') {
        scripts.push(await response.text().catch(() => ''))
      }
    })

    await mockBackends(page)
    await page.goto('./')
    await page.waitForLoadState('networkidle')

    for (const content of scripts) {
      expect(content).not.toMatch(/\bsk\.ey[A-Za-z0-9]/)
      expect(content).not.toMatch(/API_SECRET|PRIVATE_KEY/)
    }
  })
})

test.describe('Kiwiture — hors ligne', () => {
  test.use({ serviceWorkers: 'allow' })

  test('Scénario 6 — hors ligne avec cache local', async ({ page, context }) => {
    await mockBackends(page)
    await useMockedPosition(page)

    await page.goto('./')
    await expect(page.getByTestId('station-card').first()).toBeVisible()

    // The service worker must control the page before we cut the network,
    // otherwise the reload cannot even fetch the shell.
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          })
          registration.active?.postMessage('ping')
          setTimeout(resolve, 3000)
        })
      }
    })

    // Go offline and reload: the IndexedDB cache must carry the stations.
    await context.setOffline(true)
    await page.reload()

    await expect(page.getByTestId('offline-banner')).toBeVisible()
    await expect(page.getByTestId('station-card').first()).toBeVisible()
    await expect(page.getByText('Affichage des dernières données disponibles')).toBeVisible()

    await context.setOffline(false)
  })
})
