import type { StyleSpecification } from 'maplibre-gl'
import { hasUsableMapboxToken, MAPBOX_PUBLIC_TOKEN } from '@/config/env'

/**
 * Basemap style (spec 5.3).
 *
 * MapLibre reads Mapbox styles when a public token is configured; otherwise it
 * falls back to CARTO's free vector styles built on OpenStreetMap data, so the
 * app is fully functional with no token at all.
 */

const CARTO_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export function getMapStyleUrl(theme: 'light' | 'dark'): string | StyleSpecification {
  if (hasUsableMapboxToken()) {
    const styleId = theme === 'dark' ? 'dark-v11' : 'streets-v12'
    return `https://api.mapbox.com/styles/v1/mapbox/${styleId}?access_token=${MAPBOX_PUBLIC_TOKEN}`
  }
  return theme === 'dark' ? CARTO_DARK : CARTO_LIGHT
}

export function getMapAttribution(): string {
  return hasUsableMapboxToken()
    ? '© Mapbox © OpenStreetMap'
    : '© OpenStreetMap contributors © CARTO'
}
