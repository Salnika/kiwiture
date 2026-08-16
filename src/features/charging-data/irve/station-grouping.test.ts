import { describe, expect, it } from 'vitest'
import {
  allFixtureRows,
  complexPriceRow,
  freeStationRow,
  invalidCoordinatesRow,
  makeRow,
  multiEvseRows,
  pricedStationRow,
  unknownPriceRow,
} from '@/test/fixtures/irve/rows'
import { groupRowsIntoStations } from './station-grouping'

const byName = (stations: ReturnType<typeof groupRowsIntoStations>, name: string) => {
  const station = stations.find((candidate) => candidate.name === name)
  if (!station) throw new Error(`Station absente: ${name}`)
  return station
}

describe('groupRowsIntoStations', () => {
  it('groups rows sharing id_station_itinerance into a single station', () => {
    const stations = groupRowsIntoStations(multiEvseRows)
    expect(stations).toHaveLength(1)
    expect(stations[0]?.evses).toHaveLength(3)
  })

  it('takes the maximum power of the grouped EVSEs', () => {
    const stations = groupRowsIntoStations(multiEvseRows)
    expect(stations[0]?.maxPowerKw).toBe(150)
  })

  it('unions the connectors of the grouped EVSEs', () => {
    const stations = groupRowsIntoStations(multiEvseRows)
    expect(stations[0]?.connectors.sort()).toEqual(['CCS', 'CHADEMO', 'TYPE_2'].sort())
  })

  it('rejects rows with invalid coordinates', () => {
    const stations = groupRowsIntoStations([invalidCoordinatesRow])
    expect(stations).toHaveLength(0)
  })

  it('keeps the raw tariff text even when the price is unknown', () => {
    const stations = groupRowsIntoStations([unknownPriceRow])
    const station = stations[0]
    expect(station?.pricing.confidence).toBe('unknown')
    expect(station?.pricing.energyPricePerKwh).toBeUndefined()
    expect(station?.pricing.raw).toBe('Tarification selon abonnement opérateur.')
  })

  it('marks a simple tariff as parsed', () => {
    const stations = groupRowsIntoStations([pricedStationRow])
    expect(stations[0]?.pricing.confidence).toBe('parsed')
    expect(stations[0]?.pricing.energyPricePerKwh).toBe(0.49)
  })

  it('parses a composite session + energy tariff', () => {
    const stations = groupRowsIntoStations([complexPriceRow])
    expect(stations[0]?.pricing.energyPricePerKwh).toBe(0.35)
    expect(stations[0]?.pricing.sessionFee).toBe(0.5)
  })

  it('handles free stations', () => {
    const stations = groupRowsIntoStations([freeStationRow])
    expect(stations[0]?.pricing.energyPricePerKwh).toBe(0)
    expect(stations[0]?.payment.free).toBe(true)
  })

  it('never claims availability data it does not have', () => {
    const stations = groupRowsIntoStations(allFixtureRows)
    for (const station of stations) {
      expect(station.dataQuality.availability).toBe('unknown')
      for (const evse of station.evses) {
        expect(evse.status).toBe('UNKNOWN')
      }
    }
  })

  it('falls back to a local id when id_station_itinerance is a placeholder', () => {
    const rows = [
      makeRow({
        id_station_itinerance: 'Non concerné',
        id_station_local: 'LOCAL-A',
        id_pdc_itinerance: 'PDC-A1',
      }),
      makeRow({
        id_station_itinerance: 'Non concerné',
        id_station_local: 'LOCAL-A',
        id_pdc_itinerance: 'PDC-A2',
      }),
    ]
    const stations = groupRowsIntoStations(rows)
    expect(stations).toHaveLength(1)
    expect(stations[0]?.evses).toHaveLength(2)
  })

  it('deduplicates repeated points de charge', () => {
    const duplicated = [pricedStationRow, { ...pricedStationRow }]
    const stations = groupRowsIntoStations(duplicated)
    expect(stations[0]?.evses).toHaveLength(1)
  })

  it('rescales power expressed in watts', () => {
    const stations = groupRowsIntoStations([makeRow({ puissance_nominale: 22000 })])
    expect(stations[0]?.maxPowerKw).toBe(22)
  })

  it('produces one station per distinct id across a mixed dataset', () => {
    const stations = groupRowsIntoStations(allFixtureRows)
    expect(stations).toHaveLength(6)
    expect(byName(stations, 'Hub Test').evses).toHaveLength(3)
  })

  it('carries the source label and dataset metadata', () => {
    const stations = groupRowsIntoStations([pricedStationRow], {
      source: { datasetUpdatedAt: '2026-08-16T03:46:12Z', resourceId: 'abc' },
    })
    expect(stations[0]?.source.label).toContain('IRVE')
    expect(stations[0]?.source.datasetUpdatedAt).toBe('2026-08-16T03:46:12Z')
    expect(stations[0]?.source.resourceId).toBe('abc')
  })
})
