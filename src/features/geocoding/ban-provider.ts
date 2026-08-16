import { z } from 'zod'
import { GEOCODING_MAX_RESULTS } from '@/config/constants'
import { NetworkError } from '@/lib/network/errors'
import { getJson } from '@/lib/network/http'
import type { LatLng } from '@/lib/geo/coordinates'
import type { GeocodingProvider, GeocodingResult } from './provider'

/**
 * Base Adresse Nationale geocoder (api-adresse.data.gouv.fr).
 *
 * Default provider: open data, no key at all, France-only — which matches the
 * V1 perimeter (spec 59) and keeps the app usable without any token.
 */

const BASE_URL = 'https://api-adresse.data.gouv.fr'

const featureSchema = z.object({
  geometry: z.object({
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z.object({
    id: z.string().optional(),
    label: z.string(),
    name: z.string().optional(),
    postcode: z.string().optional(),
    city: z.string().optional(),
    context: z.string().optional(),
    type: z.string().optional(),
  }),
})

const responseSchema = z.object({
  features: z.array(featureSchema),
})

function kindOf(type: string | undefined): GeocodingResult['kind'] {
  switch (type) {
    case 'housenumber':
      return 'address'
    case 'street':
      return 'street'
    case 'municipality':
    case 'locality':
      return 'city'
    default:
      return 'other'
  }
}

function toResult(feature: z.infer<typeof featureSchema>, index: number): GeocodingResult {
  const [longitude, latitude] = feature.geometry.coordinates
  const properties = feature.properties
  const contextParts = [properties.postcode, properties.city].filter(Boolean)
  return {
    id: properties.id ?? `ban-${index}-${latitude},${longitude}`,
    label: properties.name ?? properties.label,
    context: contextParts.length > 0 ? contextParts.join(' ') : properties.context,
    latitude,
    longitude,
    kind: kindOf(properties.type),
  }
}

export class BanGeocodingProvider implements GeocodingProvider {
  readonly id = 'ban'
  readonly attribution = 'Base Adresse Nationale — data.gouv.fr'

  async search(
    query: string,
    options: { proximity?: LatLng; signal?: AbortSignal } = {},
  ): Promise<GeocodingResult[]> {
    const trimmed = query.trim()
    if (trimmed.length < 3) return []

    const params = new URLSearchParams({
      q: trimmed,
      limit: String(GEOCODING_MAX_RESULTS),
      autocomplete: '1',
    })
    if (options.proximity) {
      params.set('lat', options.proximity.latitude.toFixed(5))
      params.set('lon', options.proximity.longitude.toFixed(5))
    }

    const response = await getJson(`${BASE_URL}/search/?${params.toString()}`, responseSchema, {
      timeoutMs: 8_000,
      retries: 1,
      signal: options.signal,
    })

    return response.features.slice(0, GEOCODING_MAX_RESULTS).map(toResult)
  }

  async reverse(
    lat: number,
    lon: number,
    options: { signal?: AbortSignal } = {},
  ): Promise<GeocodingResult> {
    const params = new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6) })
    const response = await getJson(`${BASE_URL}/reverse/?${params.toString()}`, responseSchema, {
      timeoutMs: 8_000,
      retries: 1,
      signal: options.signal,
    })

    const first = response.features[0]
    if (!first) {
      throw new NetworkError('validation', 'Aucune adresse trouvée à cette position.')
    }
    return toResult(first, 0)
  }
}
