import type { Page, Route } from '@playwright/test'

/**
 * Network doubles for the E2E suite (spec 48).
 * Every external dependency is stubbed so the tests are deterministic and never
 * hit data.gouv, OSRM or a tile server.
 */

export const PARIS = { latitude: 48.8566, longitude: 2.3522 }

const RESOURCE_ID = 'test-resource-id'

/** Minimal MapLibre style: renders a blank canvas, requires no tiles. */
const BLANK_STYLE = {
  version: 8,
  name: 'test',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#e9edf2' },
    },
  ],
}

function row(overrides: Record<string, unknown>) {
  return {
    nom_amenageur: 'Aménageur Test',
    nom_operateur: 'Opérateur Test',
    nom_enseigne: 'Réseau Test',
    id_station_itinerance: 'FRTSTP000001',
    id_station_local: 'LOC-1',
    nom_station: 'Station Test',
    implantation_station: 'Voirie',
    adresse_station: '1 rue de Test 75001 Paris',
    coordonneesXY: [2.3522, 48.8566],
    nbre_pdc: 1,
    id_pdc_itinerance: 'FRTSTE000001',
    id_pdc_local: 'PDC-1',
    puissance_nominale: 22,
    prise_type_ef: false,
    prise_type_2: true,
    prise_type_combo_ccs: false,
    prise_type_chademo: false,
    prise_type_autre: false,
    gratuit: false,
    paiement_acte: true,
    paiement_cb: true,
    paiement_autre: false,
    tarification: '0,40 €/kWh',
    condition_acces: 'Accès libre',
    reservation: false,
    horaires: '24/7',
    accessibilite_pmr: 'Accessible mais non réservé PMR',
    date_maj: '2026-08-01',
    consolidated_longitude: 2.3522,
    consolidated_latitude: 48.8566,
    consolidated_code_postal: '75001',
    consolidated_commune: 'Paris',
    ...overrides,
  }
}

/** Deterministic dataset: one station per interesting case. */
export const TEST_ROWS = [
  row({
    id_station_itinerance: 'FRTSTP000020',
    id_pdc_itinerance: 'FRTSTE000020',
    nom_station: 'Rapide Chatelet',
    tarification: '0,49 €/kWh',
    puissance_nominale: 300,
    prise_type_2: false,
    prise_type_combo_ccs: true,
    coordonneesXY: [2.3488, 48.8584],
    consolidated_longitude: 2.3488,
    consolidated_latitude: 48.8584,
  }),
  row({
    id_station_itinerance: 'FRTSTP000010',
    id_pdc_itinerance: 'FRTSTE000010',
    nom_station: 'Mairie recharge gratuite',
    gratuit: true,
    tarification: 'Recharge gratuite',
    puissance_nominale: 7.4,
    coordonneesXY: [2.3555, 48.8551],
    consolidated_longitude: 2.3555,
    consolidated_latitude: 48.8551,
  }),
  row({
    id_station_itinerance: 'FRTSTP000040',
    id_pdc_itinerance: 'FRTSTE000040',
    nom_station: 'Centre commercial Test',
    tarification: 'Tarification selon abonnement opérateur.',
    puissance_nominale: 22,
    paiement_cb: false,
    coordonneesXY: [2.3601, 48.8602],
    consolidated_longitude: 2.3601,
    consolidated_latitude: 48.8602,
  }),
  row({
    id_station_itinerance: 'FRTSTP000050',
    id_pdc_itinerance: 'FRTSTE000051',
    nom_station: 'Hub Bastille',
    nbre_pdc: 2,
    puissance_nominale: 150,
    prise_type_2: false,
    prise_type_combo_ccs: true,
    tarification: '0,55 €/kWh',
    coordonneesXY: [2.3697, 48.8532],
    consolidated_longitude: 2.3697,
    consolidated_latitude: 48.8532,
  }),
  row({
    id_station_itinerance: 'FRTSTP000050',
    id_pdc_itinerance: 'FRTSTE000052',
    nom_station: 'Hub Bastille',
    nbre_pdc: 2,
    puissance_nominale: 50,
    prise_type_2: false,
    prise_type_chademo: true,
    tarification: '0,55 €/kWh',
    coordonneesXY: [2.3697, 48.8532],
    consolidated_longitude: 2.3697,
    consolidated_latitude: 48.8532,
  }),
]

export interface MockOptions {
  /** Make every routing call fail, to exercise the Haversine fallback. */
  breakRouting?: boolean
  /** Make the IRVE data source fail. */
  breakStations?: boolean
  rows?: typeof TEST_ROWS
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  })

export async function mockBackends(page: Page, options: MockOptions = {}): Promise<void> {
  const rows = options.rows ?? TEST_ROWS

  // --- Basemap: blank style, no tile traffic --------------------------------
  await page.route('**/basemaps.cartocdn.com/**', (route) => {
    if (route.request().url().includes('style.json')) return json(route, BLANK_STYLE)
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/api.mapbox.com/**', (route) => json(route, BLANK_STYLE))

  // --- data.gouv dataset metadata ------------------------------------------
  await page.route('**/www.data.gouv.fr/api/1/datasets/**', (route) =>
    json(route, {
      id: 'dataset-id',
      slug: 'base-nationale-des-irve-infrastructures-de-recharge-pour-vehicules-electriques',
      title: 'Base nationale des IRVE',
      last_update: '2026-08-16T03:48:45Z',
      resources: [
        {
          id: RESOURCE_ID,
          title: 'Consolidation de la dernière version à date du schéma (v2.3.1)',
          format: 'csv',
          url: 'https://static.data.gouv.fr/resources/test.csv',
          filesize: 1000,
          last_modified: '2026-08-16T03:46:12Z',
        },
      ],
    }),
  )

  // --- Tabular API ----------------------------------------------------------
  await page.route('**/tabular-api.data.gouv.fr/**', (route) => {
    if (options.breakStations) return json(route, { errors: [{ title: 'boom' }] }, 503)

    const url = new URL(route.request().url())
    const pageSize = Number(url.searchParams.get('page_size') ?? '20')
    const pageNumber = Number(url.searchParams.get('page') ?? '1')

    // The repository probes with page_size=1 to size the search area.
    const start = (pageNumber - 1) * pageSize
    const slice = rows.slice(start, start + pageSize)

    return json(route, {
      data: slice,
      meta: { page: pageNumber, page_size: pageSize, total: rows.length },
    })
  })

  // --- BAN geocoding --------------------------------------------------------
  await page.route('**/api-adresse.data.gouv.fr/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/reverse')) {
      return json(route, {
        features: [
          {
            geometry: { coordinates: [PARIS.longitude, PARIS.latitude] },
            properties: {
              id: 'rev-1',
              label: '1 rue de Rivoli 75001 Paris',
              name: '1 rue de Rivoli',
              postcode: '75001',
              city: 'Paris',
              type: 'housenumber',
            },
          },
        ],
      })
    }

    return json(route, {
      features: [
        {
          geometry: { coordinates: [PARIS.longitude, PARIS.latitude] },
          properties: {
            id: 'ban-paris',
            label: 'Paris',
            name: 'Paris',
            postcode: '75000',
            city: 'Paris',
            type: 'municipality',
          },
        },
        {
          geometry: { coordinates: [2.3333, 48.8666] },
          properties: {
            id: 'ban-paris-9',
            label: 'Paris 9e Arrondissement',
            name: 'Paris 9e Arrondissement',
            postcode: '75009',
            city: 'Paris',
            type: 'municipality',
          },
        },
      ],
    })
  })

  // --- OSRM routing ---------------------------------------------------------
  await page.route('**/router.project-osrm.org/**', (route) => {
    if (options.breakRouting) return route.abort('failed')

    const url = new URL(route.request().url())

    if (url.pathname.includes('/table/v1/')) {
      const coordinates = (url.pathname.split('/').pop() ?? '').split('?')[0] ?? ''
      const count = coordinates.split(';').length
      const destinations = Math.max(0, count - 1)
      return json(route, {
        code: 'Ok',
        distances: [[0, ...Array.from({ length: destinations }, (_, i) => 1200 + i * 800)]],
        durations: [[0, ...Array.from({ length: destinations }, (_, i) => 240 + i * 180)]],
      })
    }

    return json(route, {
      code: 'Ok',
      routes: [
        {
          distance: 4200,
          duration: 720,
          geometry: 'ohivHsstMoDaFcE_HkDkF',
        },
      ],
      waypoints: [],
    })
  })
}

/** Grants and fakes geolocation for a browser context. */
export async function useMockedPosition(page: Page): Promise<void> {
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: PARIS.latitude, longitude: PARIS.longitude })
}
