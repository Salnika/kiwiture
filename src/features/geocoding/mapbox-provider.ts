import { z } from 'zod'
import { GEOCODING_MAX_RESULTS } from '@/config/constants'
import { MAPBOX_PUBLIC_TOKEN } from '@/config/env'
import { NetworkError } from '@/lib/network/errors'
import { getJson } from '@/lib/network/http'
import type { LatLng } from '@/lib/geo/coordinates'
import type { GeocodingProvider, GeocodingResult } from './provider'

/**
 * Mapbox Geocoding v5 (spec 5.2).
 *
 * Uses the browser-safe public token only. A `sk.*` token is rejected upstream
 * in `config/env.ts` and never reaches this module.
 */

const BASE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places'

const featureSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  place_name: z.string(),
  center: z.tuple([z.number(), z.number()]),
  place_type: z.array(z.string()).optional(),
})

const responseSchema = z.object({
  features: z.array(featureSchema),
})

function kindOf(placeTypes: string[] | undefined): GeocodingResult['kind'] {
  const first = placeTypes?.[0]
  if (first === 'address') return 'address'
  if (first === 'poi') return 'poi'
  if (first === 'place' || first === 'locality') return 'city'
  return 'other'
}

function toResult(feature: z.infer<typeof featureSchema>): GeocodingResult {
  const [longitude, latitude] = feature.center
  const label = feature.text ?? feature.place_name
  const context = feature.place_name === label ? undefined : feature.place_name
  return {
    id: feature.id,
    label,
    context,
    latitude,
    longitude,
    kind: kindOf(feature.place_type),
  }
}

export class MapboxGeocodingProvider implements GeocodingProvider {
  readonly id = 'mapbox'
  readonly attribution = '© Mapbox © OpenStreetMap'

  private buildUrl(query: string, extra: Record<string, string>): string {
    const params = new URLSearchParams({
      access_token: MAPBOX_PUBLIC_TOKEN,
      language: 'fr',
      limit: String(GEOCODING_MAX_RESULTS),
      ...extra,
    })
    return `${BASE_URL}/${encodeURIComponent(query)}.json?${params.toString()}`
  }

  async search(
    query: string,
    options: { proximity?: LatLng; signal?: AbortSignal } = {},
  ): Promise<GeocodingResult[]> {
    const trimmed = query.trim()
    if (trimmed.length < 3) return []

    const extra: Record<string, string> = { autocomplete: 'true', country: 'fr' }
    if (options.proximity) {
      extra.proximity = `${options.proximity.longitude},${options.proximity.latitude}`
    }

    const response = await getJson(this.buildUrl(trimmed, extra), responseSchema, {
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
    const response = await getJson(
      this.buildUrl(`${lon},${lat}`, { limit: '1' }),
      responseSchema,
      { timeoutMs: 8_000, retries: 1, signal: options.signal },
    )
    const first = response.features[0]
    if (!first) throw new NetworkError('validation', 'Aucune adresse trouvée à cette position.')
    return toResult(first)
  }
}
