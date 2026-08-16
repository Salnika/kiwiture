import type { StationWithDistance } from '@/types/domain'

/**
 * Stations as a GeoJSON source (spec 18.4).
 *
 * Feeding MapLibre a native source lets it cluster and render thousands of
 * points on the GPU — no DOM markers, no jank.
 */

export interface StationFeatureProperties {
  id: string
  name: string
  /** Label drawn inside the pin: a price, `Gratuit`, or `?` (spec 18.2). */
  label: string
  hasPrice: boolean
  isFree: boolean
  price: number
  powerKw: number
}

export type StationFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  StationFeatureProperties
>

/** `0,49 €` — compact enough to fit inside a map pin. */
function pinLabel(station: StationWithDistance): string {
  const price = station.pricing.energyPricePerKwh
  if (price === undefined) return '?'
  if (price === 0) return 'Gratuit'
  return `${price.toFixed(2).replace('.', ',')} €`
}

export function toStationFeatureCollection(
  stations: readonly StationWithDistance[],
): StationFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((station) => ({
      type: 'Feature',
      id: station.id,
      geometry: {
        type: 'Point',
        coordinates: [station.location.longitude, station.location.latitude],
      },
      properties: {
        id: station.id,
        name: station.name,
        label: pinLabel(station),
        hasPrice: station.pricing.energyPricePerKwh !== undefined,
        isFree: station.pricing.energyPricePerKwh === 0,
        price: station.pricing.energyPricePerKwh ?? -1,
        powerKw: station.maxPowerKw,
      },
    })),
  }
}
