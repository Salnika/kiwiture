import { describe, expect, it } from 'vitest'
import { boundingBoxAround } from '@/lib/geo/coordinates'
import { resolveIrveResource } from './dataset-resource'
import { countRowsInBoundingBox, fetchRowsInBoundingBox } from './tabular-client'
import { groupRowsIntoStations } from './station-grouping'

/**
 * Contract test against the real data.gouv APIs.
 *
 * Skipped by default (third-party availability, rate limits). Run deliberately:
 * `LIVE_IRVE=1 npm test -- live`.
 */
const live = process.env.LIVE_IRVE ? describe : describe.skip

live('IRVE live contract', () => {
  it('resolves the current consolidated resource', async () => {
    const resource = await resolveIrveResource({ force: true })
    expect(resource.resourceId).toMatch(/^[0-9a-f-]{10,}$/)
    expect(resource.format).toBe('csv')
    expect(resource.fileUrl).toContain('data.gouv.fr')
  }, 60_000)

  it('counts and fetches rows in a bounding box, then groups them', async () => {
    const resource = await resolveIrveResource()
    const box = boundingBoxAround({ latitude: 48.8566, longitude: 2.3522 }, 1)

    const total = await countRowsInBoundingBox(resource.resourceId, box)
    expect(total).toBeGreaterThan(0)

    const { rows } = await fetchRowsInBoundingBox(resource.resourceId, box, { maxRows: 400 })
    expect(rows.length).toBeGreaterThan(0)

    const stations = groupRowsIntoStations(rows)
    expect(stations.length).toBeGreaterThan(0)
    expect(stations.length).toBeLessThanOrEqual(rows.length)

    for (const station of stations) {
      expect(Number.isFinite(station.location.latitude)).toBe(true)
      expect(station.location.latitude).toBeGreaterThan(48)
      expect(station.location.latitude).toBeLessThan(49)
      expect(station.evses.length).toBeGreaterThan(0)
      expect(station.maxPowerKw).toBeGreaterThanOrEqual(0)
    }

    const withPrice = stations.filter((s) => s.pricing.energyPricePerKwh !== undefined)
    const withRawText = stations.filter((s) => s.pricing.raw !== undefined)
    console.info(
      `[live] ${rows.length} lignes -> ${stations.length} stations, ` +
        `${withPrice.length} avec prix exploitable, ${withRawText.length} avec texte tarifaire`,
    )
  }, 120_000)
})
